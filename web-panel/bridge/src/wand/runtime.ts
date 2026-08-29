const crypto = require('node:crypto');
const path = require('node:path');

const { IPC_CHANNEL, REMOTE_COMMAND_RESPONSE_TIMEOUT_MS } = require('../constants');
const { writeInstallLog } = require('../logger');
const { ensureBridge } = require('../runtime');
const { installRendererScripts } = require('./renderer-scripts');
const { localizeTrainerSnapshot } = require('./trainer-localization');
const { safeString } = require('../utils');

import type { BridgeOptions, ElectronPort, IpcMainEventPort, WebContentsPort } from '../types';

type RuntimePort = {
    remoteUrl: string;
    setHandler(handler: (request: unknown) => boolean): void;
    setCommandHandler(handler: (request: unknown) => Promise<unknown>): void;
    sync(snapshot: unknown): void;
    syncTrainerMeta(snapshot: unknown): void;
    syncInstalledApps(snapshot: unknown): void;
    syncGameStatus(snapshot: unknown): void;
    valueChanged(change: unknown): void;
};

declare global {
    var __wandRemoteBridgeBoundRenderers: Set<WebContentsPort> | undefined;
    var __wandRemoteBridgePendingCommandResponses:
        | Map<string, (response: unknown) => void>
        | undefined;
    var __wandRemoteBridgeActiveRuntime: RuntimePort | undefined;
    var __wandRemoteBridgeIpcInstalled: boolean | undefined;
}

const WEMOD_ACCESS_TOKEN_SCRIPT =
    'JSON.parse(localStorage.getItem("infinity:globalStore") || "{}")?.token?.accessToken ?? null';

function installWandRuntime(electron: ElectronPort, options: BridgeOptions = {}) {
    const runtime = ensureBridge(options);
    if (!electron?.ipcMain || !electron.app) {
        throw new Error('Electron main-process API is required to install Wand runtime hooks.');
    }

    const boundRenderers: Set<WebContentsPort> =
        globalThis.__wandRemoteBridgeBoundRenderers || new Set();
    const pendingCommandResponses =
        globalThis.__wandRemoteBridgePendingCommandResponses || new Map();
    globalThis.__wandRemoteBridgeBoundRenderers = boundRenderers;
    globalThis.__wandRemoteBridgePendingCommandResponses = pendingCommandResponses;

    runtime.setHandler((request: unknown) => {
        let delivered = false;
        for (const sender of liveRenderers(boundRenderers)) {
            try {
                sender.send(IPC_CHANNEL.SET_VALUE, request);
                delivered = true;
            } catch (error) {
                boundRenderers.delete(sender);
                writeInstallLog('warn', 'Failed to forward set_value to renderer.', error);
            }
        }

        return delivered;
    });

    runtime.setCommandHandler(async (request: unknown) => {
        const [sender] = liveRenderers(boundRenderers);
        if (!sender) {
            return buildRendererBridgeMissingResponse(request);
        }

        try {
            return await dispatchRemoteCommandToRenderer(sender, request, pendingCommandResponses);
        } catch (error) {
            writeInstallLog('warn', 'Failed to execute remote command in renderer.', error);
            return buildRendererBridgeMissingResponse(request);
        }
    });

    installIpcHandlers(electron, runtime, boundRenderers, pendingCommandResponses);
    installRendererScripts(electron, runtime, {
        ...options,
        panelRoot: options.panelRoot || path.dirname(__dirname),
    });
    writeInstallLog('info', 'Wand runtime hooks installed.');
    return runtime;
}

function installIpcHandlers(
    electron: ElectronPort,
    activeRuntime: RuntimePort,
    boundRenderers: Set<WebContentsPort>,
    pendingCommandResponses: Map<string, (response: unknown) => void>,
) {
    // Handlers can only be registered once per channel, so they read the runtime through a
    // mutable global: a reinstall must retarget them instead of leaving them on the old one.
    globalThis.__wandRemoteBridgeActiveRuntime = activeRuntime;
    if (globalThis.__wandRemoteBridgeIpcInstalled) {
        return;
    }

    globalThis.__wandRemoteBridgeIpcInstalled = true;
    const runtime = () => globalThis.__wandRemoteBridgeActiveRuntime as RuntimePort;
    let trainerSnapshotRevision = 0;
    electron.ipcMain.handle(
        IPC_CHANNEL.TRAINER_SNAPSHOT,
        (event: IpcMainEventPort, snapshot: unknown) => {
            const revision = ++trainerSnapshotRevision;
            runtime().sync(snapshot);
            void localizeSnapshot(event?.sender, snapshot)
                .then((localizedSnapshot) => {
                    if (localizedSnapshot !== snapshot && revision === trainerSnapshotRevision) {
                        runtime().syncTrainerMeta(localizedSnapshot);
                    }
                })
                .catch((error: unknown) => {
                    writeInstallLog('warn', 'Failed to localize trainer metadata.', error);
                });
            return true;
        },
    );
    electron.ipcMain.handle(
        IPC_CHANNEL.INSTALLED_APPS,
        (_event: IpcMainEventPort, snapshot: unknown) => {
            runtime().syncInstalledApps(snapshot);
            return true;
        },
    );
    electron.ipcMain.handle(
        IPC_CHANNEL.GAME_STATUS,
        (_event: IpcMainEventPort, snapshot: unknown) => {
            runtime().syncGameStatus(snapshot);
            return true;
        },
    );
    electron.ipcMain.handle(
        IPC_CHANNEL.COMMAND_RESPONSE,
        (_event: IpcMainEventPort, response: unknown) => {
            const requestId = safeString((response as Record<string, unknown>)?.requestId);
            const resolvePending = requestId ? pendingCommandResponses.get(requestId) : null;
            if (!resolvePending) {
                return false;
            }

            resolvePending(response);
            return true;
        },
    );
    electron.ipcMain.handle(
        IPC_CHANNEL.VALUE_CHANGED,
        (_event: IpcMainEventPort, change: unknown) => {
            runtime().valueChanged(change);
            return true;
        },
    );
    electron.ipcMain.handle(IPC_CHANNEL.BIND_HANDLER, (event: IpcMainEventPort) => {
        const sender = event?.sender;
        if (sender) {
            if (!boundRenderers.has(sender)) {
                boundRenderers.add(sender);
                // Without this the set grows for the lifetime of the app: entries are otherwise
                // only dropped when a later send happens to fail.
                sender.once?.('destroyed', () => boundRenderers.delete(sender));
            }
        }

        return true;
    });
    electron.ipcMain.handle(IPC_CHANNEL.REMOTE_URL, () => runtime().remoteUrl);
}

function liveRenderers(boundRenderers: Set<WebContentsPort>) {
    const live: WebContentsPort[] = [];
    for (const sender of Array.from(boundRenderers) as WebContentsPort[]) {
        if (sender && !sender.isDestroyed()) {
            live.push(sender);
        } else {
            boundRenderers.delete(sender);
        }
    }

    return live;
}

async function localizeSnapshot(sender: WebContentsPort | undefined, snapshot: unknown) {
    const accessToken = await readWemodAccessToken(sender);
    return localizeTrainerSnapshot(snapshot, accessToken);
}

async function readWemodAccessToken(sender: WebContentsPort | undefined) {
    if (!sender || typeof sender.executeJavaScript !== 'function' || sender.isDestroyed?.()) {
        return null;
    }

    try {
        const token = await sender.executeJavaScript(WEMOD_ACCESS_TOKEN_SCRIPT);
        return typeof token === 'string' && token ? token : null;
    } catch (error) {
        writeInstallLog('warn', 'Failed to read WeMod access token from renderer.', error);
        return null;
    }
}

function dispatchRemoteCommandToRenderer(
    sender: WebContentsPort,
    request: unknown,
    pendingCommandResponses: Map<string, (response: unknown) => void>,
) {
    return new Promise((resolve, reject) => {
        const requestId = `remote_command_${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36)}`;
        const timer = setTimeout(() => {
            pendingCommandResponses.delete(requestId);
            reject(new Error('Renderer remote command timed out.'));
        }, REMOTE_COMMAND_RESPONSE_TIMEOUT_MS);

        pendingCommandResponses.set(requestId, (response) => {
            clearTimeout(timer);
            pendingCommandResponses.delete(requestId);
            resolve(response);
        });

        try {
            sender.send(IPC_CHANNEL.COMMAND_REQUEST, {
                ...(request as object),
                requestId,
            });
        } catch (error) {
            clearTimeout(timer);
            pendingCommandResponses.delete(requestId);
            reject(error);
        }
    });
}

function buildRendererBridgeMissingResponse(request: unknown) {
    const req = request as Record<string, unknown> | undefined;
    return {
        ok: false,
        action: req?.action === 'stop' ? 'stop' : 'launch',
        gameId: typeof req?.gameId === 'string' ? req.gameId : null,
        titleId: typeof req?.titleId === 'string' ? req.titleId : null,
        error: {
            code: 'bridge_not_ready',
            message: 'The renderer command bridge is not ready yet.',
        },
    };
}

module.exports = {
    installWandRuntime,
};
