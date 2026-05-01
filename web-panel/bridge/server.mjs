import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import demoSession from '../fixtures/demo-session.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const DEFAULT_REMOTE_PORT = 3223;
const DEFAULT_REMOTE_HOST = '0.0.0.0';
const REMOTE_BASE_PATH = '/remote/';
const REMOTE_WS_PATH = '/remote/ws';
const REMOTE_HEALTH_PATH = '/remote/api/health';
const REMOTE_ASSETS_PREFIX = '/remote/assets/';
const host = process.env.HOST || DEFAULT_REMOTE_HOST;
const port = Number(process.env.PORT || DEFAULT_REMOTE_PORT);

const trainerMeta = structuredClone(demoSession.trainerMeta);
const trainerValues = structuredClone(demoSession.trainerValues);

const wss = new WebSocketServer({ noServer: true });

function jsonMessage(type, payload, requestId = null) {
  return JSON.stringify({
    type,
    version: 1,
    requestId,
    payload,
  });
}

function sendSnapshot(ws) {
  ws.send(
    jsonMessage('trainer_meta', trainerMeta)
  );
  ws.send(
    jsonMessage('trainer_values', trainerValues)
  );
}

function broadcast(type, payload, requestId = null) {
  const serialized = jsonMessage(type, payload, requestId);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(serialized);
    }
  }
}

function normalizeValue(target, value) {
  const cheat = trainerMeta.schema.cheats.find((entry) => entry.target === target);
  if (!cheat) {
    return value;
  }

  if (cheat.type === 'toggle') {
    return Boolean(value);
  }

  if (cheat.type === 'slider' || cheat.type === 'number') {
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? numeric : trainerValues.values[target];
  }

  return value;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function serveFile(res, filePath) {
  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/' || url.pathname === '') {
    res.writeHead(302, { Location: REMOTE_BASE_PATH });
    res.end();
    return;
  }

  if (url.pathname === REMOTE_BASE_PATH.slice(0, -1)) {
    res.writeHead(302, { Location: REMOTE_BASE_PATH });
    res.end();
    return;
  }

  if (url.pathname === REMOTE_BASE_PATH) {
    await serveFile(res, path.join(distDir, 'index.html'));
    return;
  }

  if (url.pathname === REMOTE_HEALTH_PATH) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, trainerId: trainerMeta.trainer.trainerId }));
    return;
  }

  if (url.pathname.startsWith(REMOTE_ASSETS_PREFIX)) {
    const relativePath = url.pathname.replace(REMOTE_BASE_PATH, '');
    await serveFile(res, path.join(distDir, relativePath));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname !== REMOTE_WS_PATH) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  ws.on('error', console.error);

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(String(raw));
      if (message?.type === 'hello') {
        ws.send(
          jsonMessage('hello_ack', {
            sessionId: `sess_${Date.now()}`,
            accepted: true,
            serverVersion: '0.1.0-demo',
            protocolVersion: 1,
          }, message.requestId ?? null)
        );
        sendSnapshot(ws);
        return;
      }

      if (message?.type === 'set_value') {
        const target = message.payload?.target;
        if (typeof target !== 'string' || !(target in trainerValues.values)) {
          ws.send(
            jsonMessage('set_value_result', {
              ok: false,
              trainerId: trainerMeta.trainer.trainerId,
              target: typeof target === 'string' ? target : '',
              error: {
                code: 'invalid_target',
                message: 'Unknown cheat target.',
              },
            }, message.requestId ?? null)
          );
          return;
        }

        const previousValue = trainerValues.values[target];
        const nextValue = normalizeValue(target, message.payload?.value);
        trainerValues.values[target] = nextValue;

        ws.send(
          jsonMessage('set_value_result', {
            ok: true,
            trainerId: trainerMeta.trainer.trainerId,
            target,
          }, message.requestId ?? null)
        );

        broadcast('value_changed', {
          trainerId: trainerMeta.trainer.trainerId,
          target,
          value: nextValue,
          oldValue: previousValue,
          source: 'remote',
          cheatId: message.payload?.cheatId,
        });
      }
    } catch (error) {
      ws.send(
        jsonMessage('error', {
          code: 'invalid_message',
          message: error instanceof Error ? error.message : 'Failed to parse client message.',
        })
      );
    }
  });
});

server.listen(port, host, () => {
  console.log(`Wand web panel bridge listening on http://${host === DEFAULT_REMOTE_HOST ? 'localhost' : host}:${port}${REMOTE_BASE_PATH}`);
});