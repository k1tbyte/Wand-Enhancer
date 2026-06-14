import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { WebSocket as NodeWebSocket } from 'ws';

describe('production bridge runtime', () => {
  it('preserves the public API and sends cached snapshots after hello', async () => {
    const bridge = require('../../dist/bridge.cjs');
    expect(Object.keys(bridge).sort()).toEqual(['createBridgeRuntime', 'ensureBridge', 'installWandRuntime']);

    const port = await getFreePort();
    const runtime = bridge.createBridgeRuntime({ host: '127.0.0.1', port, maxPort: port });
    runtime.sync(rawTrainerSnapshot());

    try {
      await waitUntil(() => runtime.listening);
      const messages = await connectAndCollect(port, 3);
      expect(messages.map((message) => message.type)).toEqual(['hello_ack', 'trainer_meta', 'trainer_values']);
      expect(messages[2].payload.values.god).toBe(true);
    } finally {
      runtime.close();
    }
  });
});

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function connectAndCollect(port: number, count: number): Promise<any[]> {
  return await new Promise((resolve, reject) => {
    const messages: any[] = [];
    const socket = new NodeWebSocket(`ws://127.0.0.1:${port}/remote/ws`);
    socket.once('error', reject);
    socket.once('open', () => socket.send(JSON.stringify({
      type: 'hello',
      version: 1,
      requestId: 'hello',
      payload: {
        client: 'mobile-web',
        clientVersion: 'test',
        capabilities: { supportsDeltaValues: true, supportsTrainerSwitch: true },
      },
    })));
    socket.on('message', (raw) => {
      messages.push(JSON.parse(String(raw)));
      if (messages.length === count) {
        socket.close();
        resolve(messages);
      }
    });
  });
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Bridge did not start listening.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function rawTrainerSnapshot() {
  return {
    instanceId: 'instance',
    trainerId: 'trainer',
    trainerInfo: { gameId: 'game', displayName: 'Game' },
    metadata: {
      info: {
        blueprint: {
          cheats: [{
            uuid: 'god',
            target: 'god',
            type: 'toggle',
            name: 'God mode',
            category: 'player',
            args: {},
          }],
        },
      },
    },
    values: { god: 1 },
  };
}
