const http = require('node:http');
const path = require('node:path');

const {
    BRIDGE_PROTOCOL_VERSION,
    BRIDGE_SERVER_VERSION,
    DEFAULT_REMOTE_HOST,
    DEFAULT_REMOTE_PORT,
    PORT_SCAN_RANGE,
    REMOTE_ASSETS_PREFIX,
    REMOTE_BASE_PATH,
    REMOTE_HEALTH_PATH,
    REMOTE_INSTALLED_APPS_API_PATH,
    REMOTE_WS_PATH,
    WS_OPCODE,
} = require('./constants.cjs');
const { createBridgeLogger } = require('./logger.cjs');
const {
    buildInstalledAppsDebugPayload,
    gameStatusSignature,
    installedAppsSignature,
    normalizeGameStatusSnapshot,
    normalizeInstalledAppsSnapshot,
    normalizeRemoteCommandAction,
    normalizeRemoteCommandResult,
    normalizeSnapshot,
    summarizeInstalledAppsSource,
} = require('./normalizers.cjs');
const { getAdvertisedUrls, serveFile } = require('./static-server.cjs');
const { cloneValue, isRecord, isValidPort, safeString } = require('./utils.cjs');
const { closeClient, createAcceptKey, makeFrame, parseFrame, sendJson } = require('./websocket.cjs');

function createBridgeRuntime(options = {}) {
    const preferredPort = Number(options.port || process.env.WAND_REMOTE_PORT || DEFAULT_REMOTE_PORT);
    let port = isValidPort(preferredPort) ? preferredPort : DEFAULT_REMOTE_PORT;
    const maxPort = Number(options.maxPort || process.env.WAND_REMOTE_MAX_PORT || port + PORT_SCAN_RANGE);
    const host = options.host || process.env.WAND_REMOTE_HOST || DEFAULT_REMOTE_HOST;
    const panelRoot = options.panelRoot || path.dirname(__dirname);
    const clients = new Set();
    const log = createBridgeLogger(options);
    let advertisedUrls = [];
    let currentSnapshot = null;
    let currentInstalledApps = null;
    let currentInstalledAppsSignature = null;
    let currentGameStatus = null;
    let currentGameStatusSignature = null;
    let setValueHandler = null;
    let commandHandler = null;
    let listening = false;

    function setAdvertisedPort(nextPort) {
        port = nextPort;
        advertisedUrls = getAdvertisedUrls(port);
        globalThis.__wandRemoteBridgeUrl = advertisedUrls.find((entry) => !entry.includes('localhost')) || advertisedUrls[0];
    }

    function broadcast(type, payload, requestId = null) {
        for (const client of clients) {
            sendJson(client, type, payload, requestId);
        }
    }

    function sendSnapshot(client) {
        if (!currentSnapshot) {
            sendJson(client, 'trainer_changed', {
                previousTrainerId: null,
                trainerId: '',
            });
        } else {
            sendJson(client, 'trainer_meta', currentSnapshot.trainerMeta);
            sendJson(client, 'trainer_values', currentSnapshot.trainerValues);
        }

        if (currentGameStatus) {
            sendJson(client, 'game_status', currentGameStatus);
        }

        if (currentInstalledApps) {
            sendJson(client, 'installed_apps', currentInstalledApps);
        }
    }

    function sync(rawSnapshot) {
        const nextSnapshot = rawSnapshot ? normalizeSnapshot(rawSnapshot) : null;
        const previousTrainerId = currentSnapshot?.trainerMeta?.trainer?.trainerId ?? null;
        const nextTrainerId = nextSnapshot?.trainerMeta?.trainer?.trainerId ?? null;
        currentSnapshot = nextSnapshot;

        if (previousTrainerId !== nextTrainerId) {
            broadcast('trainer_changed', {
                previousTrainerId,
                trainerId: nextTrainerId || '',
            });
        }

        if (!currentSnapshot) {
            return;
        }

        broadcast('trainer_meta', currentSnapshot.trainerMeta);
        broadcast('trainer_values', currentSnapshot.trainerValues);
    }

    function valueChanged(change) {
        if (!currentSnapshot || !isRecord(change)) {
            return;
        }

        const target = safeString(change.target);
        if (!target) {
            return;
        }

        currentSnapshot.trainerValues.values[target] = cloneValue(change.value);
        broadcast('value_changed', {
            trainerId: safeString(change.trainerId, currentSnapshot.trainerMeta.trainer.trainerId),
            target,
            value: cloneValue(change.value),
            oldValue: cloneValue(change.oldValue),
            source: safeString(change.source, 'desktop'),
            cheatId: typeof change.cheatId === 'string' ? change.cheatId : undefined,
        });
    }

    function syncInstalledApps(rawInstalledApps) {
        const sourceSummary = summarizeInstalledAppsSource(rawInstalledApps);
        const nextInstalledApps = normalizeInstalledAppsSnapshot(rawInstalledApps);
        if (!nextInstalledApps) {
            log('warn', `Ignored invalid installed apps snapshot.${sourceSummary ? ` ${sourceSummary}` : ''}`);
            return;
        }

        const nextSignature = installedAppsSignature(nextInstalledApps);
        if (nextSignature === currentInstalledAppsSignature) {
            log('info', `Installed apps snapshot unchanged (${nextInstalledApps.apps.length} app(s)).${sourceSummary ? ` ${sourceSummary}` : ''}`);
            return;
        }

        currentInstalledApps = nextInstalledApps;
        currentInstalledAppsSignature = nextSignature;
        log('info', `Installed apps snapshot accepted (${currentInstalledApps.apps.length} app(s)).${sourceSummary ? ` ${sourceSummary}` : ''}`);
        broadcast('installed_apps', currentInstalledApps);
    }

    function syncGameStatus(rawGameStatus) {
        const nextGameStatus = normalizeGameStatusSnapshot(rawGameStatus);
        if (!nextGameStatus) {
            log('warn', 'Ignored invalid game status snapshot.');
            return;
        }

        const nextSignature = gameStatusSignature(nextGameStatus);
        if (nextSignature === currentGameStatusSignature) {
            return;
        }

        currentGameStatus = nextGameStatus;
        currentGameStatusSignature = nextSignature;
        log('info', `Game status snapshot accepted (${currentGameStatus.session.state}/${currentGameStatus.session.event}).`);
        broadcast('game_status', currentGameStatus);
    }

    function setHandler(handler) {
        setValueHandler = typeof handler === 'function' ? handler : null;
    }

    function setCommandHandler(handler) {
        commandHandler = typeof handler === 'function' ? handler : null;
    }

    function buildHealthPayload() {
        const installedAppsDebug = buildInstalledAppsDebugPayload(currentInstalledApps);
        return {
            ok: listening,
            trainerId: currentSnapshot?.trainerMeta?.trainer?.trainerId || null,
            gameSessionState: currentGameStatus?.session?.state || 'idle',
            gameSessionEvent: currentGameStatus?.session?.event || 'snapshot',
            runningTrainerId: currentGameStatus?.trainer?.trainerId || null,
            installedAppsCount: installedAppsDebug.counts.myGamesEntries,
            installedRawAppsCount: installedAppsDebug.counts.rawInstallEntries,
            installedTitlesCount: installedAppsDebug.counts.groupedTitles,
            installedUniqueTitleIdsCount: installedAppsDebug.counts.uniqueTitleIds,
            installedUniqueGameIdsCount: installedAppsDebug.counts.uniqueGameIds,
            installedAppsApiPath: REMOTE_INSTALLED_APPS_API_PATH,
            remoteUrl: globalThis.__wandRemoteBridgeUrl,
            advertisedUrls,
        };
    }

    function handleRequest(request, response) {
        const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

        if (url.pathname === '/' || url.pathname === '') {
            response.writeHead(302, { Location: '/remote/' });
            response.end();
            return;
        }

        if (url.pathname === REMOTE_BASE_PATH.slice(0, -1)) {
            response.writeHead(302, { Location: REMOTE_BASE_PATH });
            response.end();
            return;
        }

        if (url.pathname === REMOTE_BASE_PATH) {
            serveFile(response, path.join(panelRoot, 'index.html'));
            return;
        }

        if (url.pathname === REMOTE_HEALTH_PATH) {
            response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify(buildHealthPayload()));
            return;
        }

        if (url.pathname === REMOTE_INSTALLED_APPS_API_PATH) {
            response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify(buildInstalledAppsDebugPayload(currentInstalledApps), null, 2));
            return;
        }

        if (url.pathname.startsWith(REMOTE_ASSETS_PREFIX)) {
            serveFile(response, path.join(panelRoot, url.pathname.replace(REMOTE_BASE_PATH, '')));
            return;
        }

        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    }

    async function handleRemoteCommandMessage(client, message) {
        const action = normalizeRemoteCommandAction(message.payload?.action);
        const gameId = typeof message.payload?.gameId === 'string' || typeof message.payload?.gameId === 'number'
            ? String(message.payload.gameId)
            : null;
        const titleId = typeof message.payload?.titleId === 'string' || typeof message.payload?.titleId === 'number'
            ? String(message.payload.titleId)
            : null;

        if (!action) {
            sendJson(client, 'error', {
                code: 'invalid_command',
                message: 'Unknown remote command.',
            }, message.requestId ?? null);
            return;
        }

        const fallback = { action, gameId, titleId };
        if (action === 'launch' && !gameId) {
            sendJson(client, 'remote_command_result', normalizeRemoteCommandResult({
                ok: false,
                error: {
                    code: 'invalid_game',
                    message: 'A game id is required to launch a trainer.',
                },
            }, fallback), message.requestId ?? null);
            return;
        }

        if (!commandHandler) {
            sendJson(client, 'remote_command_result', normalizeRemoteCommandResult({
                ok: false,
                error: {
                    code: 'bridge_not_ready',
                    message: 'The local bridge is not ready to execute remote game commands yet.',
                },
            }, fallback), message.requestId ?? null);
            return;
        }

        try {
            const result = await Promise.resolve(commandHandler({ action, gameId, titleId }));
            sendJson(client, 'remote_command_result', normalizeRemoteCommandResult(result, fallback), message.requestId ?? null);
        } catch (error) {
            sendJson(client, 'remote_command_result', normalizeRemoteCommandResult({
                ok: false,
                error: {
                    code: 'command_failed',
                    message: error instanceof Error ? error.message : 'Failed to execute the remote command.',
                },
            }, fallback), message.requestId ?? null);
        }
    }

    async function handleSetValueMessage(client, message) {
        const target = safeString(message.payload?.target);
        if (!currentSnapshot || !target || !(target in currentSnapshot.trainerValues.values)) {
            sendJson(client, 'set_value_result', {
                ok: false,
                trainerId: currentSnapshot?.trainerMeta?.trainer?.trainerId || '',
                target,
                error: {
                    code: 'invalid_target',
                    message: 'Unknown cheat target.',
                },
            }, message.requestId ?? null);
            return;
        }

        if (!setValueHandler) {
            sendJson(client, 'set_value_result', {
                ok: false,
                trainerId: currentSnapshot.trainerMeta.trainer.trainerId,
                target,
                error: {
                    code: 'bridge_not_ready',
                    message: 'The local bridge is not ready to write trainer values yet.',
                },
            }, message.requestId ?? null);
            return;
        }

        let result = false;
        try {
            result = await Promise.resolve(setValueHandler({
                trainerId: currentSnapshot.trainerMeta.trainer.trainerId,
                target,
                value: cloneValue(message.payload?.value),
                cheatId: typeof message.payload?.cheatId === 'string' ? message.payload.cheatId : undefined,
            }));
        } catch (error) {
            sendJson(client, 'set_value_result', {
                ok: false,
                trainerId: currentSnapshot.trainerMeta.trainer.trainerId,
                target,
                error: {
                    code: 'set_failed',
                    message: error instanceof Error ? error.message : 'Failed to set trainer value.',
                },
            }, message.requestId ?? null);
            return;
        }

        if (!result) {
            sendJson(client, 'set_value_result', {
                ok: false,
                trainerId: currentSnapshot.trainerMeta.trainer.trainerId,
                target,
                error: {
                    code: 'set_rejected',
                    message: 'The trainer rejected the requested value.',
                },
            }, message.requestId ?? null);
            return;
        }

        sendJson(client, 'set_value_result', {
            ok: true,
            trainerId: currentSnapshot.trainerMeta.trainer.trainerId,
            target,
        }, message.requestId ?? null);
    }

    async function handleClientMessage(client, message) {
        if (message?.type === 'hello') {
            sendJson(client, 'hello_ack', {
                sessionId: `sess_${Date.now()}`,
                accepted: true,
                serverVersion: BRIDGE_SERVER_VERSION,
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                remoteUrl: globalThis.__wandRemoteBridgeUrl,
                advertisedUrls,
            }, message.requestId ?? null);
            sendSnapshot(client);
            return;
        }

        if (message?.type === 'remote_command') {
            await handleRemoteCommandMessage(client, message);
            return;
        }

        if (message?.type === 'set_value') {
            await handleSetValueMessage(client, message);
        }
    }

    function bindSocket(socket) {
        const client = {
            socket,
            buffer: Buffer.alloc(0),
            closed: false,
        };

        clients.add(client);

        socket.on('data', async (chunk) => {
            try {
                client.buffer = Buffer.concat([client.buffer, chunk]);

                while (client.buffer.length > 0) {
                    const frame = parseFrame(client.buffer);
                    if (!frame) {
                        return;
                    }

                    client.buffer = client.buffer.subarray(frame.bytesConsumed);

                    if (!frame.fin) {
                        closeClient(client, 1003, 'Fragmented frames are not supported.');
                        return;
                    }

                    if (frame.opcode === WS_OPCODE.CLOSE) {
                        closeClient(client, 1000, 'Closing');
                        return;
                    }

                    if (frame.opcode === WS_OPCODE.PING) {
                        client.socket.write(makeFrame(WS_OPCODE.PONG, frame.payload));
                        continue;
                    }

                    if (frame.opcode !== WS_OPCODE.TEXT) {
                        continue;
                    }

                    await handleClientMessage(client, JSON.parse(frame.payload.toString('utf8')));
                }
            } catch (error) {
                sendJson(client, 'error', {
                    code: 'invalid_message',
                    message: error instanceof Error ? error.message : 'Failed to process client message.',
                });
            }
        });

        socket.on('close', () => {
            client.closed = true;
            clients.delete(client);
        });

        socket.on('end', () => {
            client.closed = true;
            clients.delete(client);
        });

        socket.on('error', (error) => {
            client.closed = true;
            clients.delete(client);
            log('warn', 'WebSocket client error.', error);
        });
    }

    function handleUpgrade(request, socket) {
        const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
        if (url.pathname !== REMOTE_WS_PATH) {
            socket.destroy();
            return;
        }

        const key = request.headers['sec-websocket-key'];
        if (typeof key !== 'string' || !key) {
            socket.destroy();
            return;
        }

        socket.write([
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${createAcceptKey(key)}`,
            '',
            '',
        ].join('\r\n'));

        bindSocket(socket);
    }

    function listen(nextPort) {
        setAdvertisedPort(nextPort);
        server.listen(port, host);
    }

    setAdvertisedPort(port);
    log('info', `Bridge starting (pid=${process.pid}, panelRoot=${panelRoot}, preferredPort=${port}, host=${host})`);
    globalThis.__wandRemoteBridgeLogFile = log.file;

    const server = http.createServer(handleRequest);
    server.on('upgrade', handleUpgrade);
    server.on('error', (error) => {
        if (!listening && error && error.code === 'EADDRINUSE' && port < maxPort) {
            const nextPort = port + 1;
            log('warn', `Port ${port} is busy, trying ${nextPort}.`);
            listen(nextPort);
            return;
        }

        log('warn', `Bridge server error on ${host}:${port}.`, error);
    });
    server.on('listening', () => {
        listening = true;
        log('info', `Listening on ${globalThis.__wandRemoteBridgeUrl}`);
    });

    listen(port);

    return {
        get advertisedUrls() {
            return advertisedUrls.slice();
        },
        get listening() {
            return listening;
        },
        get remoteUrl() {
            return globalThis.__wandRemoteBridgeUrl;
        },
        close() {
            for (const client of clients) {
                closeClient(client);
            }
            clients.clear();
            currentSnapshot = null;
            currentInstalledApps = null;
            currentInstalledAppsSignature = null;
            currentGameStatus = null;
            currentGameStatusSignature = null;
            listening = false;
            server.close();
        },
        setCommandHandler,
        setHandler,
        sync,
        syncGameStatus,
        syncInstalledApps,
        valueChanged,
    };
}

function ensureBridge(options = {}) {
    if (!globalThis.__wandRemoteBridgeRuntime) {
        globalThis.__wandRemoteBridgeRuntime = createBridgeRuntime(options);
    }

    return globalThis.__wandRemoteBridgeRuntime;
}

module.exports = {
    createBridgeRuntime,
    ensureBridge,
};
