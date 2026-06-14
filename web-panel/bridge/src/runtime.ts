const { createBridgeServer } = require('./server');
import type { BridgeOptions } from './types';

function createBridgeRuntime(options: BridgeOptions = {}) {
    return createBridgeServer(options);
}

function ensureBridge(options: BridgeOptions = {}) {
    if (!globalThis.__wandRemoteBridgeRuntime) {
        globalThis.__wandRemoteBridgeRuntime = createBridgeRuntime(options);
    }

    return globalThis.__wandRemoteBridgeRuntime;
}

module.exports = {
    createBridgeRuntime,
    ensureBridge,
};
