// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

const bundled = buildSync({
    entryPoints: [resolve(import.meta.dirname, 'bridge-state.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
}).outputFiles[0].text;
const { createBridgeState } = new Function(
    'module',
    'require',
    `${bundled};return module.exports;`,
)({ exports: {} }, createRequire(import.meta.url));
const payloadRoot = resolve(import.meta.dirname, '../../../WandEnhancer/Patches');
const capture = readFileSync(
    resolve(payloadRoot, 'remote-bridge-value-subscription.js'),
    'utf8',
).replace(/\$\{trainerId\}/g, 'this.trainerId');
const delta = readFileSync(resolve(payloadRoot, 'remote-bridge-value-delta.js'), 'utf8').replaceAll(
    /\$\{change\}/g,
    'change',
);

const subscribe = new Function(`${capture}return change => {${delta}};`);

const snapshot = (trainerId: string) => ({
    trainerId,
    trainerInfo: { gameId: 'game', displayName: 'Game' },
    metadata: {
        info: {
            blueprint: {
                cheats: [
                    { uuid: 'god', target: 'god', type: 'toggle', name: 'God mode', args: {} },
                ],
            },
        },
    },
    values: { god: 1 },
});

describe('injected renderer value contract', () => {
    const createState = () =>
        createBridgeState({ clients: [], log() {}, getServerInfo: () => ({}) });

    it('accepts desktop and remote-origin changes from the actual patch payload', () => {
        const state = createState();
        state.sync(snapshot('first'));
        const changed = subscribe.call({ trainerId: 'first', __wandRemoteBridge: state });

        changed({ name: 'god', value: 0, oldValue: 1, source: 'desktop' });
        expect(state.snapshot.trainerValues.values.god).toBe(false);
        changed({ name: 'god', value: 1, oldValue: 0, source: 3 });
        expect(state.snapshot.trainerValues.values.god).toBe(true);
    });

    it('rejects old subscriptions after switching trainers', () => {
        const state = createState();
        state.sync(snapshot('first'));
        const renderer = { trainerId: 'first', __wandRemoteBridge: state };
        const oldChanged = subscribe.call(renderer);
        renderer.trainerId = 'second';
        state.sync(snapshot('second'));

        oldChanged({ name: 'god', value: 0 });
        state.valueChanged({ target: 'god', value: 0 });
        expect(state.snapshot.trainerValues.values.god).toBe(true);

        subscribe.call(renderer)({ name: 'god', value: 0 });
        expect(state.snapshot.trainerValues.values.god).toBe(false);
    });
});
