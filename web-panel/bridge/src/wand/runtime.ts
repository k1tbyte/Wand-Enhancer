const crypto = require('node:crypto');
const path = require('node:path');

const {
    IPC_CHANNEL,
    REMOTE_COMMAND_REQUEST_CHANNEL,
    REMOTE_COMMAND_RESPONSE_CHANNEL,
    REMOTE_COMMAND_RESPONSE_TIMEOUT_MS,
    REMOTE_GAME_STATUS_CHANNEL,
    REMOTE_INSTALLED_APPS_CHANNEL,
} = require('../constants');
const { writeInstallLog } = require('../logger');
const { ensureBridge } = require('../runtime');
const { installRendererScripts } = require('./renderer-scripts');
const { localizeTrainerSnapshot } = require('./trainer-localization');
const { safeString } = require('../utils');
import type { BridgeOptions, ElectronPort, WebContentsPort } from '../types';

const WEMOD_ACCESS_TOKEN_SCRIPT =
    'JSON.parse(localStorage.getItem("infinity:globalStore") || "{}")?.token?.accessToken ?? null';

function installWandRuntime(electron: ElectronPort, options: BridgeOptions = {}) {
    const runtime = ensureBridge(options);
    if (!electron || !electron.ipcMain || !electron.app) {
        throw new Error('Electron main-process API is required to install Wand runtime hooks.');
    }

    const boundRenderers: Set<WebContentsPort> = globalThis.__wandRemoteBridgeBoundRenderers || new Set();
    const pendingCommandResponses = globalThis.__wandRemoteBridgePendingCommandResponses || new Map();
    globalThis.__wandRemoteBridgeBoundRenderers = boundRenderers;
    globalThis.__wandRemoteBridgePendingCommandResponses = pendingCommandResponses;

    runtime.setHandler((request) => {
        let delivered = false;
        for (const sender of Array.from(boundRenderers)) {
            try {
                if (!sender || sender.isDestroyed()) {
                    boundRenderers.delete(sender);
                    continue;
                }

                sender.send(IPC_CHANNEL.SET_VALUE, request);
                delivered = true;
            } catch (error) {
                boundRenderers.delete(sender);
                writeInstallLog('warn', 'Failed to forward set_value to renderer.', error);
            }
        }

        return delivered;
    });

    runtime.setCommandHandler(async (request) => {
        for (const sender of Array.from(boundRenderers)) {
            try {
                if (!sender || sender.isDestroyed()) {
                    boundRenderers.delete(sender);
                    continue;
                }

                return await dispatchRemoteCommandToRenderer(sender, request, pendingCommandResponses);
            } catch (error) {
                writeInstallLog('warn', 'Failed to execute remote command in renderer.', error);
            }
        }

        return buildRendererBridgeMissingResponse(request);
    });

    installIpcHandlers(electron, runtime, boundRenderers, pendingCommandResponses);
    installRendererScripts(electron, runtime, {
        ...options,
        panelRoot: options.panelRoot || path.dirname(__dirname),
    });
    writeInstallLog('info', 'Wand runtime hooks installed.');
    return runtime;
}

function installIpcHandlers(electron, runtime, boundRenderers, pendingCommandResponses) {
    if (globalThis.__wandRemoteBridgeIpcInstalled) {
        return;
    }

    globalThis.__wandRemoteBridgeIpcInstalled = true;
    let trainerSnapshotRevision = 0;
    electron.ipcMain.handle(IPC_CHANNEL.TRAINER_SNAPSHOT, (event, snapshot) => {
        const revision = ++trainerSnapshotRevision;
        runtime.sync(snapshot);
        void localizeSnapshot(event?.sender, snapshot).then((localizedSnapshot) => {
            if (localizedSnapshot !== snapshot && revision === trainerSnapshotRevision) {
                runtime.syncTrainerMeta(localizedSnapshot);
            }
        }).catch((error) => {
            writeInstallLog('warn', 'Failed to localize trainer metadata.', error);
        });
        return true;
    });
    electron.ipcMain.handle(REMOTE_INSTALLED_APPS_CHANNEL, (_event, snapshot) => {
        runtime.syncInstalledApps(snapshot);
        return true;
    });
    electron.ipcMain.handle(REMOTE_GAME_STATUS_CHANNEL, (_event, snapshot) => {
        runtime.syncGameStatus(snapshot);
        return true;
    });
    electron.ipcMain.handle(REMOTE_COMMAND_RESPONSE_CHANNEL, (_event, response) => {
        const requestId = safeString(response?.requestId);
        const pending = requestId ? pendingCommandResponses.get(requestId) : null;
        if (!pending) {
            return false;
        }

        pending.resolve(response);
        return true;
    });
    electron.ipcMain.handle(IPC_CHANNEL.VALUE_CHANGED, (_event, change) => {
        runtime.valueChanged(change);
        return true;
    });
    electron.ipcMain.handle(IPC_CHANNEL.BIND_HANDLER, (event) => {
        if (event && event.sender) {
            boundRenderers.add(event.sender);
        }

        return true;
    });
    electron.ipcMain.handle(IPC_CHANNEL.REMOTE_URL, () => runtime.remoteUrl);
}

async function localizeSnapshot(sender, snapshot) {
    const accessToken = await readWemodAccessToken(sender);
    return localizeTrainerSnapshot(snapshot, accessToken);
}

async function readWemodAccessToken(sender) {
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

function dispatchRemoteCommandToRenderer(sender, request, pendingCommandResponses) {
    return new Promise((resolve, reject) => {
        const requestId = `remote_command_${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36)}`;
        const timer = setTimeout(() => {
            pendingCommandResponses.delete(requestId);
            reject(new Error('Renderer remote command timed out.'));
        }, REMOTE_COMMAND_RESPONSE_TIMEOUT_MS);

        pendingCommandResponses.set(requestId, {
            resolve: (response) => {
                clearTimeout(timer);
                pendingCommandResponses.delete(requestId);
                resolve(response);
            },
            reject: (error) => {
                clearTimeout(timer);
                pendingCommandResponses.delete(requestId);
                reject(error instanceof Error ? error : new Error(String(error)));
            },
        });

        try {
            sender.send(REMOTE_COMMAND_REQUEST_CHANNEL, {
                ...request,
                requestId,
            });
        } catch (error) {
            clearTimeout(timer);
            pendingCommandResponses.delete(requestId);
            reject(error);
        }
    });
}

function buildRendererBridgeMissingResponse(request) {
    return {
        ok: false,
        action: request?.action === 'stop' ? 'stop' : 'launch',
        gameId: typeof request?.gameId === 'string' ? request.gameId : null,
        titleId: typeof request?.titleId === 'string' ? request.titleId : null,
        error: {
            code: 'bridge_not_ready',
            message: 'The renderer command bridge is not ready yet.',
        },
    };
}

module.exports = {
    installWandRuntime,
};
