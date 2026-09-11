const { createBridgeServer } = require('./server');

import type { BridgeOptions } from './types';

declare global {
    var __wandRemoteBridgeRuntime: ReturnType<typeof createBridgeRuntime> | undefined;
}

function createBridgeRuntime(options: BridgeOptions = {}) {
    return createBridgeServer(options);
}

function ensureBridge(options: BridgeOptions = {}) {
    // A closed instance must not be handed out again: its server is gone and its state cleared.
    if (!globalThis.__wandRemoteBridgeRuntime || globalThis.__wandRemoteBridgeRuntime.closed) {
        globalThis.__wandRemoteBridgeRuntime = createBridgeRuntime(options);
    }

    return globalThis.__wandRemoteBridgeRuntime;
}

module.exports = {
    createBridgeRuntime,
    ensureBridge,
};
