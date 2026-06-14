const { createBridgeRuntime: createRuntime, ensureBridge: ensureRuntime } = require('./runtime');
const { installWandRuntime: installRuntime } = require('./wand/runtime');
import type { BridgeOptions, ElectronPort } from './types';

function withDefaultPanelRoot(options: BridgeOptions = {}): BridgeOptions {
    if (options.panelRoot) {
        return options;
    }

    return {
        ...options,
        panelRoot: __dirname,
    };
}

function createBridgeRuntime(options: BridgeOptions = {}) {
    return createRuntime(withDefaultPanelRoot(options));
}

function ensureBridge(options: BridgeOptions = {}) {
    return ensureRuntime(withDefaultPanelRoot(options));
}

function installWandRuntime(electron: ElectronPort, options: BridgeOptions = {}) {
    return installRuntime(electron, withDefaultPanelRoot(options));
}

module.exports = {
    createBridgeRuntime,
    ensureBridge,
    installWandRuntime,
};
