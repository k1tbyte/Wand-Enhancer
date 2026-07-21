const http = require('node:http');
const path = require('node:path');

const {
    BRIDGE_PROTOCOL_VERSION,
    BRIDGE_SERVER_VERSION,
    DEFAULT_REMOTE_HOST,
    DEFAULT_REMOTE_PORT,
    DEV_SERVER_PORTS,
    PORT_SCAN_RANGE,
    REMOTE_ASSETS_PREFIX,
    REMOTE_BASE_PATH,
    REMOTE_HEALTH_PATH,
    REMOTE_WS_PATH,
    WS_OPCODE,
} = require('./constants');
const { createBridgeLogger } = require('./logger');
const {
    normalizeRemoteCommandAction,
    normalizeRemoteCommandResult,
} = require('./normalizers');
const { createBridgeState } = require('./bridge-state');
const { validateClientMessage, validateSetValueTarget } = require('./protocol-router');
const { getAdvertisedUrls, serveFile } = require('./server-files');
const { cloneValue, isValidPort, safeString } = require('./utils');
const {
    closeClient,
    createAcceptKey,
    FRAME_TOO_LARGE_ERROR,
    makeFrame,
    parseFrame,
    sendJson,
} = require('./websocket-codec');
import type { BridgeOptions } from './types';

function createBridgeServer(options: BridgeOptions = {}) {
    const preferredPort = Number(options.port || process.env.WAND_REMOTE_PORT || DEFAULT_REMOTE_PORT);
    let port = isValidPort(preferredPort) ? preferredPort : DEFAULT_REMOTE_PORT;
    const maxPort = Number(options.maxPort || process.env.WAND_REMOTE_MAX_PORT || port + PORT_SCAN_RANGE);
    const host = options.host || process.env.WAND_REMOTE_HOST || DEFAULT_REMOTE_HOST;
    const panelRoot = options.panelRoot || path.dirname(__dirname);
    const clients = new Set<any>();
    const log = createBridgeLogger(options);
    let advertisedUrls: string[] = [];
    let setValueHandler: any = null;
    let commandHandler: any = null;
    let listening = false;
    const bridgeState = createBridgeState({
        clients,
        log,
        getServerInfo: () => ({
            advertisedUrls,
            listening,
            remoteUrl: globalThis.__wandRemoteBridgeUrl,
        }),
    });

    function setAdvertisedPort(nextPort) {
        port = nextPort;
        advertisedUrls = getAdvertisedUrls(port);
        globalThis.__wandRemoteBridgeUrl = advertisedUrls.find((entry) => !entry.includes('localhost')) || advertisedUrls[0];
    }

    function setHandler(handler) {
        setValueHandler = typeof handler === 'function' ? handler : null;
    }

    function setCommandHandler(handler) {
        commandHandler = typeof handler === 'function' ? handler : null;
    }

    function handleRequest(request, response) {
        const url = parseRequestUrl(request.url);
        if (!url) {
            response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Bad Request');
            return;
        }

        if (url.pathname === '/' || url.pathname === '') {
            response.writeHead(302, { Location: REMOTE_BASE_PATH });
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
            response.end(JSON.stringify(bridgeState.buildHealthPayload()));
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
            log('warn', 'Remote command handler failed.', error);
            sendJson(client, 'remote_command_result', normalizeRemoteCommandResult({
                ok: false,
                error: {
                    code: 'command_failed',
                    message: 'Failed to execute the remote command.',
                },
            }, fallback), message.requestId ?? null);
        }
    }

    async function handleSetValueMessage(client, message) {
        const currentSnapshot = bridgeState.snapshot;
        const validation = validateSetValueTarget(message, currentSnapshot);
        if (!validation.ok) {
            sendJson(client, 'set_value_result', {
                ok: false,
                trainerId: currentSnapshot?.trainerMeta?.trainer?.trainerId || '',
                target: safeString(message.payload?.target),
                error: validation.error,
            }, message.requestId ?? null);
            return;
        }
        const { target } = validation;

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
                value: cloneValue(validation.value),
                cheatId: typeof message.payload?.cheatId === 'string' ? message.payload.cheatId : undefined,
            }));
        } catch (error) {
            log('warn', 'Set-value handler failed.', error);
            sendJson(client, 'set_value_result', {
                ok: false,
                trainerId: currentSnapshot.trainerMeta.trainer.trainerId,
                target,
                error: {
                    code: 'set_failed',
                    message: 'Failed to set trainer value.',
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
        const validation = validateClientMessage(message, client.handshaken);
        if (!validation.ok) {
            sendJson(client, 'error', validation.error, message?.requestId ?? null);
            return;
        }

        if (message?.type === 'hello') {
            client.handshaken = true;
            sendJson(client, 'hello_ack', {
                sessionId: `sess_${Date.now()}`,
                accepted: true,
                serverVersion: BRIDGE_SERVER_VERSION,
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                remoteUrl: globalThis.__wandRemoteBridgeUrl,
                advertisedUrls,
            }, message.requestId ?? null);
            bridgeState.sendSnapshot(client);
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
            handshaken: false,
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
                if (error instanceof Error && 'code' in error && error.code === FRAME_TOO_LARGE_ERROR) {
                    closeClient(client, 1009, error.message);
                    return;
                }
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
        const url = parseRequestUrl(request.url);
        if (!url) {
            rejectUpgrade(socket, 400, 'Bad Request');
            return;
        }
        if (url.pathname !== REMOTE_WS_PATH) {
            rejectUpgrade(socket, 404, 'Not Found');
            return;
        }

        if (!isAllowedWebSocketOrigin(request.headers.origin, request.headers.host)) {
            rejectUpgrade(socket, 403, 'Forbidden');
            return;
        }

        const key = request.headers['sec-websocket-key'];
        if (typeof key !== 'string' || !key) {
            rejectUpgrade(socket, 400, 'Bad Request');
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
        log('info', `Listening on ${host}:${port}.`);
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
            bridgeState.clear();
            listening = false;
            server.close();
        },
        setCommandHandler,
        setHandler,
        sync: bridgeState.sync,
        syncTrainerMeta: bridgeState.syncTrainerMeta,
        syncGameStatus: bridgeState.syncGameStatus,
        syncInstalledApps: bridgeState.syncInstalledApps,
        valueChanged: bridgeState.valueChanged,
    };
}

function parseRequestUrl(requestUrl) {
    try {
        return new URL(requestUrl || '/', 'http://localhost');
    } catch {
        return null;
    }
}

function isAllowedWebSocketOrigin(origin, host) {
    if (origin === undefined) {
        return true;
    }
    if (typeof origin !== 'string' || typeof host !== 'string') {
        return false;
    }

    try {
        const parsed = new URL(origin);
        const requested = new URL(`http://${host}`);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
        }

        const sameHostname = parsed.hostname.toLowerCase() === requested.hostname.toLowerCase();
        const compatibleLoopback = isLoopback(parsed.hostname) && isLoopback(requested.hostname);
        return parsed.host.toLowerCase() === host.toLowerCase()
            || DEV_SERVER_PORTS.includes(parsed.port) && (sameHostname || compatibleLoopback);
    } catch {
        return false;
    }
}

function isLoopback(hostname) {
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname.toLowerCase());
}

function rejectUpgrade(socket, statusCode, statusText) {
    socket.end([
        `HTTP/1.1 ${statusCode} ${statusText}`,
        'Connection: close',
        'Content-Length: 0',
        '',
        '',
    ].join('\r\n'));
}

module.exports = {
    createBridgeServer,
};
