const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const KNOWN_CHEAT_TYPES = new Set(['slider', 'number', 'toggle', 'button', 'selection', 'scalar', 'incremental']);
const DEFAULT_REMOTE_PORT = 3223;
const PORT_SCAN_RANGE = 30;
const DEFAULT_REMOTE_HOST = '0.0.0.0';
const REMOTE_BASE_PATH = '/remote/';
const REMOTE_WS_PATH = '/remote/ws';
const REMOTE_HEALTH_PATH = '/remote/api/health';
const REMOTE_ASSETS_PREFIX = '/remote/assets/';
const BRIDGE_LOG_FILE_NAME = 'wand-remote-bridge.log';
const RENDERER_SCRIPTS_DIR = 'renderer-scripts';
const RENDERER_SCRIPT_API_VERSION = 1;

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function safeString(value, fallback = '') {
  return typeof value === 'string' && value.length ? value : fallback;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isRecord(value)) {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = cloneValue(entry);
    }
    return result;
  }

  return value;
}

function isValidPort(value) {
  return Number.isFinite(value) && value > 0 && value < 65536;
}

function normalizeOption(option) {
  if (typeof option === 'string' || typeof option === 'number') {
    return {
      label: String(option),
      value: option,
    };
  }

  if (isRecord(option)) {
    const value = option.value;
    if (typeof value === 'string' || typeof value === 'number') {
      return {
        label: safeString(option.label, String(value)),
        value,
      };
    }
  }

  return null;
}

function normalizeArgs(args) {
  if (!isRecord(args)) {
    return {};
  }

  const next = {};
  if (typeof args.min === 'number') next.min = args.min;
  if (typeof args.max === 'number') next.max = args.max;
  if (typeof args.step === 'number') next.step = args.step;
  if (typeof args.postfix === 'string') next.postfix = args.postfix;
  if (typeof args.default === 'string' || typeof args.default === 'number' || typeof args.default === 'boolean') {
    next.default = args.default;
  }

  if (Array.isArray(args.options)) {
    next.options = args.options.map(normalizeOption).filter(Boolean);
  }

  if (typeof args.button === 'string' || typeof args.button === 'boolean') {
    next.button = args.button;
  }

  return next;
}

function normalizeCheat(cheat, index) {
  if (!isRecord(cheat)) {
    return null;
  }

  const target = safeString(cheat.target);
  const type = safeString(cheat.type);
  if (!target || !KNOWN_CHEAT_TYPES.has(type)) {
    return null;
  }

  const normalized = {
    uuid: safeString(cheat.uuid, `${target}-${index}`),
    target,
    type,
    name: safeString(cheat.name, target),
    description: typeof cheat.description === 'string' ? cheat.description : null,
    instructions: typeof cheat.instructions === 'string' ? cheat.instructions : null,
    category: safeString(cheat.category, 'general'),
    parent: typeof cheat.parent === 'string' ? cheat.parent : null,
    args: normalizeArgs(cheat.args),
  };

  if (typeof cheat.flags === 'number') {
    normalized.flags = cheat.flags;
  }

  if (Array.isArray(cheat.hotkeys)) {
    normalized.hotkeys = cheat.hotkeys.filter(Array.isArray).map((group) => group.map((item) => String(item)));
  }

  return normalized;
}

function normalizeSnapshot(rawSnapshot) {
  if (!isRecord(rawSnapshot) || !isRecord(rawSnapshot.metadata) || !isRecord(rawSnapshot.metadata.info)) {
    return null;
  }

  const info = rawSnapshot.metadata.info;
  const blueprint = isRecord(info.blueprint) ? info.blueprint : {};
  const rawCheats = Array.isArray(blueprint.cheats) ? blueprint.cheats : [];
  const cheats = rawCheats.map(normalizeCheat).filter(Boolean);
  const categories = Array.from(new Set(cheats.map((entry) => entry.category)));
  const trainerId = safeString(rawSnapshot.trainerId || rawSnapshot.trainerInfo?.trainerId);
  const displayName = firstString(
    rawSnapshot.trainerInfo?.displayName,
    rawSnapshot.trainerInfo?.gameName,
    rawSnapshot.trainerInfo?.titleName,
    rawSnapshot.trainerInfo?.title,
    rawSnapshot.trainerInfo?.name,
    info.displayName,
    info.gameName,
    info.titleName,
    info.title,
    info.name,
    info.game?.displayName,
    info.game?.name,
    info.game?.title
  );

  if (!trainerId) {
    return null;
  }

  const trainerMeta = {
    session: {
      instanceId: safeString(rawSnapshot.instanceId, 'wand-session'),
    },
    trainer: {
      trainerId,
      gameId: safeString(rawSnapshot.trainerInfo?.gameId || info.gameId),
      displayName: displayName || safeString(rawSnapshot.trainerInfo?.gameId || info.gameId, trainerId),
      titleId: typeof info.titleId === 'string' ? info.titleId : null,
      gameVersion: typeof rawSnapshot.gameVersion === 'string' ? rawSnapshot.gameVersion : null,
      trainerLoading: rawSnapshot.trainerLoading === true,
      gameInstalled: rawSnapshot.gameInstalled !== false,
      needsCompatibilityWarning: rawSnapshot.needsCompatibilityWarning === true,
      language: safeString(rawSnapshot.language, 'en-US'),
      themeId: safeString(rawSnapshot.themeId, 'default'),
      isTimeLimitExpired: rawSnapshot.isTimeLimitExpired === true,
      notesReadHash: typeof rawSnapshot.notesReadHash === 'string' ? rawSnapshot.notesReadHash : null,
    },
    schema: {
      categories,
      cheats,
    },
  };

  const trainerValues = {
    trainerId,
    values: isRecord(rawSnapshot.values) ? cloneValue(rawSnapshot.values) : {},
  };

  return {
    trainerMeta,
    trainerValues,
  };
}

function jsonMessage(type, payload, requestId = null) {
  return JSON.stringify({
    type,
    version: 1,
    requestId,
    payload,
  });
}

function makeFrame(opcode, payload) {
  const source = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = [];
  header.push(0x80 | (opcode & 0x0f));

  if (source.length < 126) {
    header.push(source.length);
    return Buffer.concat([Buffer.from(header), source]);
  }

  if (source.length < 65536) {
    const prefix = Buffer.from([header[0], 126, (source.length >> 8) & 0xff, source.length & 0xff]);
    return Buffer.concat([prefix, source]);
  }

  const prefix = Buffer.alloc(10);
  prefix[0] = header[0];
  prefix[1] = 127;
  prefix.writeUInt32BE(0, 2);
  prefix.writeUInt32BE(source.length, 6);
  return Buffer.concat([prefix, source]);
}

function sendText(client, text) {
  if (!client.closed) {
    client.socket.write(makeFrame(1, Buffer.from(text, 'utf8')));
  }
}

function sendJson(client, type, payload, requestId = null) {
  sendText(client, jsonMessage(type, payload, requestId));
}

function closeClient(client, code = 1000, reason = 'Closing') {
  if (client.closed) {
    return;
  }

  client.closed = true;
  const reasonBuffer = Buffer.from(reason, 'utf8');
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  client.socket.write(makeFrame(8, payload));
  client.socket.end();
}

function parseFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const first = buffer[0];
  const second = buffer[1];
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }

    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }

    const high = buffer.readUInt32BE(offset);
    const low = buffer.readUInt32BE(offset + 4);
    if (high !== 0) {
      throw new Error('Large websocket frames are not supported.');
    }

    length = low;
    offset += 8;
  }

  let mask = null;
  if (masked) {
    if (buffer.length < offset + 4) {
      return null;
    }

    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + length) {
    return null;
  }

  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked && mask) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }

  return {
    bytesConsumed: offset + length,
    fin,
    opcode,
    payload,
  };
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.cjs':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function getAdvertisedUrls(port) {
  const urls = [];
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    if (!entries) {
      continue;
    }

    for (const entry of entries) {
      if (!entry || entry.internal || entry.family !== 'IPv4') {
        continue;
      }

      urls.push(`http://${entry.address}:${port}${REMOTE_BASE_PATH}`);
    }
  }

  urls.unshift(`http://localhost:${port}${REMOTE_BASE_PATH}`);
  return Array.from(new Set(urls));
}

function createBridgeRuntime(options = {}) {
  const preferredPort = Number(options.port || process.env.WAND_REMOTE_PORT || DEFAULT_REMOTE_PORT);
  let port = isValidPort(preferredPort) ? preferredPort : DEFAULT_REMOTE_PORT;
  const maxPort = Number(options.maxPort || process.env.WAND_REMOTE_MAX_PORT || port + PORT_SCAN_RANGE);
  const host = options.host || process.env.WAND_REMOTE_HOST || DEFAULT_REMOTE_HOST;
  const panelRoot = options.panelRoot || __dirname;
  const clients = new Set();
  let advertisedUrls = [];
  let currentSnapshot = null;
  let setValueHandler = null;
  let listening = false;

  function setAdvertisedPort(nextPort) {
    port = nextPort;
    advertisedUrls = getAdvertisedUrls(port);
    globalThis.__wandRemoteBridgeUrl = advertisedUrls.find((entry) => !entry.includes('localhost')) || advertisedUrls[0];
  }

  setAdvertisedPort(port);

  const logFile = options.logFile || path.join(os.tmpdir(), BRIDGE_LOG_FILE_NAME);

  function log(level, message, error) {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    const tag = `[wand-remote-bridge] ${message}`;
    try { console[method](tag, error || ''); } catch { /* renderer may close console */ }
    try {
      const detail = error ? ` :: ${error && error.stack ? error.stack : String(error)}` : '';
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] [${level}] ${message}${detail}\n`);
    } catch { /* best-effort */ }
  }

  log('info', `Bridge starting (pid=${process.pid}, panelRoot=${panelRoot}, preferredPort=${port}, host=${host})`);
  globalThis.__wandRemoteBridgeLogFile = logFile;

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
      return;
    }

    sendJson(client, 'trainer_meta', currentSnapshot.trainerMeta);
    sendJson(client, 'trainer_values', currentSnapshot.trainerValues);
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

    if (currentSnapshot) {
      broadcast('trainer_meta', currentSnapshot.trainerMeta);
      broadcast('trainer_values', currentSnapshot.trainerValues);
    }
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

  function setHandler(handler) {
    setValueHandler = typeof handler === 'function' ? handler : null;
  }

  function serveFile(response, filePath) {
    try {
      const content = fs.readFileSync(filePath);
      response.writeHead(200, {
        'Content-Type': contentTypeFor(filePath),
        'Cache-Control': 'no-store',
      });
      response.end(content);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  }

  const server = http.createServer((request, response) => {
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
      response.end(JSON.stringify({
        ok: listening,
        trainerId: currentSnapshot?.trainerMeta?.trainer?.trainerId || null,
        remoteUrl: globalThis.__wandRemoteBridgeUrl,
        advertisedUrls,
      }));
      return;
    }

    if (url.pathname.startsWith(REMOTE_ASSETS_PREFIX)) {
      serveFile(response, path.join(panelRoot, url.pathname.replace(REMOTE_BASE_PATH, '')));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });

  server.on('upgrade', (request, socket) => {
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

    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));

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

          if (frame.opcode === 8) {
            closeClient(client, 1000, 'Closing');
            return;
          }

          if (frame.opcode === 9) {
            client.socket.write(makeFrame(10, frame.payload));
            continue;
          }

          if (frame.opcode !== 1) {
            continue;
          }

          const message = JSON.parse(frame.payload.toString('utf8'));
          if (message?.type === 'hello') {
            sendJson(client, 'hello_ack', {
              sessionId: `sess_${Date.now()}`,
              accepted: true,
              serverVersion: '0.2.0-wand',
              protocolVersion: 1,
              remoteUrl: globalThis.__wandRemoteBridgeUrl,
              advertisedUrls,
            }, message.requestId ?? null);
            sendSnapshot(client);
            continue;
          }

          if (message?.type === 'set_value') {
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
              continue;
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
              continue;
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
              continue;
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
              continue;
            }

            sendJson(client, 'set_value_result', {
              ok: true,
              trainerId: currentSnapshot.trainerMeta.trainer.trainerId,
              target,
            }, message.requestId ?? null);
          }
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
  });

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

  function listen(nextPort) {
    setAdvertisedPort(nextPort);
    server.listen(port, host);
  }

  listen(port);

  return {
    get listening() {
      return listening;
    },
    get remoteUrl() {
      return globalThis.__wandRemoteBridgeUrl;
    },
    get advertisedUrls() {
      return advertisedUrls.slice();
    },
    sync,
    valueChanged,
    setHandler,
    close() {
      for (const client of clients) {
        closeClient(client);
      }
      clients.clear();
      currentSnapshot = null;
      listening = false;
      server.close();
    },
  };
}

function ensureBridge(options = {}) {
  if (!globalThis.__wandRemoteBridgeRuntime) {
    globalThis.__wandRemoteBridgeRuntime = createBridgeRuntime(options);
  }

  return globalThis.__wandRemoteBridgeRuntime;
}

function writeInstallLog(level, message, error) {
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
  const tag = `[wand-remote-bridge] ${message}`;
  try { console[method](tag, error || ''); } catch { /* best-effort */ }
  try {
    const detail = error ? ` :: ${error && error.stack ? error.stack : String(error)}` : '';
    fs.appendFileSync(path.join(os.tmpdir(), BRIDGE_LOG_FILE_NAME), `[${new Date().toISOString()}] [${level}] ${message}${detail}\n`);
  } catch { /* best-effort */ }
}

function loadRendererScripts(panelRoot, scriptsRoot) {
  const root = scriptsRoot || path.join(panelRoot, RENDERER_SCRIPTS_DIR);
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs.readdirSync(root)
    .filter((name) => name.endsWith('.js'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      name,
      source: fs.readFileSync(path.join(root, name), 'utf8'),
    }));
}

function buildRendererBootstrap(remoteUrl, scripts) {
  // Inline each script source directly instead of wrapping it in `new Function(...)`.
  // Wand's renderer ships with a strict CSP (no `unsafe-eval`), so any attempt to eval
  // a string at runtime — including the `Function` constructor — silently throws
  // "EvalError: Refused to evaluate a string as JavaScript". `executeJavaScript`
  // itself runs in the page's V8 context and is not affected by CSP, so concatenating
  // sources into a single payload makes scripts behave the same as a manual paste in
  // DevTools (which is the only path the user reported as working).
  const header = `
    globalThis.__wandRemoteBridgeUrl = ${JSON.stringify(remoteUrl)};
    if (!globalThis.WandEnhancer) {
      globalThis.WandEnhancer = Object.freeze({
        apiVersion: ${RENDERER_SCRIPT_API_VERSION},
        remoteUrl: ${JSON.stringify(remoteUrl)},
        log: function () { try { console.info.apply(console, ["[wand-enhancer-script]"].concat(Array.from(arguments))); } catch (_) {} },
      });
    } else {
      try { globalThis.__wandRemoteBridgeUrl = ${JSON.stringify(remoteUrl)}; } catch (_) {}
    }
    console.info("[wand-remote-bridge] Renderer bootstrap (" + ${scripts.length} + " script(s)).");
  `;

  const body = scripts.map((script) => {
    const tag = JSON.stringify(`wand-enhancer-script-${script.name}`);
    return `
      ;(function (WandEnhancer) {
        try {
          ${script.source}
        } catch (error) {
          try { console.warn("[wand-remote-bridge] Renderer script failed", ${JSON.stringify(script.name)}, error); } catch (_) {}
        }
      })(globalThis.WandEnhancer);
      //# sourceURL=${tag.slice(1, -1)}
    `;
  }).join('\n');

  return `(() => {\n${header}\n${body}\n})();`;
}

function installRendererScripts(electron, runtime, options = {}) {
  if (globalThis.__wandRemoteBridgeRendererScriptsInstalled) {
    return;
  }

  globalThis.__wandRemoteBridgeRendererScriptsInstalled = true;
  const scripts = loadRendererScripts(options.panelRoot || __dirname, options.scriptsRoot);
  if (scripts.length === 0) {
    writeInstallLog('info', 'No renderer scripts found.');
    return;
  }

  electron.app.on('web-contents-created', (_event, contents) => {
    const inject = () => {
      if (!contents || contents.isDestroyed()) {
        return;
      }

      contents.executeJavaScript(buildRendererBootstrap(runtime.remoteUrl, scripts), true)
        .catch((error) => writeInstallLog('warn', 'Failed to inject renderer scripts.', error));
    };

    contents.on('dom-ready', inject);
    contents.on('did-finish-load', inject);
    setTimeout(inject, 500);
    setTimeout(inject, 2000);
  });

  writeInstallLog('info', `Renderer script injection installed (${scripts.map((script) => script.name).join(', ')}).`);
}

function installWandRuntime(electron, options = {}) {
  const runtime = ensureBridge(options);
  if (!electron || !electron.ipcMain || !electron.app) {
    throw new Error('Electron main-process API is required to install Wand runtime hooks.');
  }

  const boundRenderers = globalThis.__wandRemoteBridgeBoundRenderers || new Set();
  globalThis.__wandRemoteBridgeBoundRenderers = boundRenderers;

  runtime.setHandler((request) => {
    let delivered = false;
    for (const sender of Array.from(boundRenderers)) {
      try {
        if (!sender || sender.isDestroyed()) {
          boundRenderers.delete(sender);
          continue;
        }

        sender.send('wand-remote-set-value', request);
        delivered = true;
      } catch (error) {
        boundRenderers.delete(sender);
        writeInstallLog('warn', 'Failed to forward set_value to renderer.', error);
      }
    }

    return delivered;
  });

  if (!globalThis.__wandRemoteBridgeIpcInstalled) {
    globalThis.__wandRemoteBridgeIpcInstalled = true;
    electron.ipcMain.handle('wand-remote-sync', (_event, snapshot) => {
      runtime.sync(snapshot);
      return true;
    });
    electron.ipcMain.handle('wand-remote-value-changed', (_event, change) => {
      runtime.valueChanged(change);
      return true;
    });
    electron.ipcMain.handle('wand-remote-set-handler-bind', (event) => {
      if (event && event.sender) {
        boundRenderers.add(event.sender);
      }

      return true;
    });
    electron.ipcMain.handle('wand-remote-url', () => runtime.remoteUrl);
  }

  installRendererScripts(electron, runtime, options);
  writeInstallLog('info', 'Wand runtime hooks installed.');
  return runtime;
}

module.exports = {
  createBridgeRuntime,
  ensureBridge,
  installWandRuntime,
};