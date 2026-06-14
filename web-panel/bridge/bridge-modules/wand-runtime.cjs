const crypto = require('node:crypto');
const path = require('node:path');

const {
    IPC_CHANNEL,
    REMOTE_COMMAND_REQUEST_CHANNEL,
    REMOTE_COMMAND_RESPONSE_CHANNEL,
    REMOTE_COMMAND_RESPONSE_TIMEOUT_MS,
    REMOTE_GAME_STATUS_CHANNEL,
    REMOTE_INSTALLED_APPS_CHANNEL,
} = require('./constants.cjs');
const { writeInstallLog } = require('./logger.cjs');
const { ensureBridge } = require('./runtime.cjs');
const { installRendererScripts } = require('./renderer-scripts.cjs');
const { safeString } = require('./utils.cjs');

function installWandRuntime(electron, options = {}) {
    const runtime = ensureBridge(options);
    if (!electron || !electron.ipcMain || !electron.app) {
        throw new Error('Electron main-process API is required to install Wand runtime hooks.');
    }

    const boundRenderers = globalThis.__wandRemoteBridgeBoundRenderers || new Set();
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
    electron.ipcMain.handle(IPC_CHANNEL.TRAINER_SNAPSHOT, (_event, snapshot) => {
        try {
            const allWindows = electron.BrowserWindow.getAllWindows();
            const win = allWindows[0];
            win.webContents
                .executeJavaScript(
                    `JSON.parse(localStorage.getItem("infinity:globalStore") || "{}")?.token?.accessToken`
                )
                .then((accessToken) => {
                    snapshot.accessToken = accessToken;
                    runtime.sync(snapshot);
                });
        } catch (e) {
            runtime.sync(snapshot);
        }
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
