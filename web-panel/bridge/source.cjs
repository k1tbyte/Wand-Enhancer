const { createBridgeRuntime: createRuntime, ensureBridge: ensureRuntime } = require('./bridge-modules/runtime.cjs');
const { installWandRuntime: installRuntime } = require('./bridge-modules/wand-runtime.cjs');

function withDefaultPanelRoot(options = {}) {
    if (options.panelRoot) {
        return options;
    }

    return {
        ...options,
        panelRoot: __dirname,
    };
}

function createBridgeRuntime(options = {}) {
    return createRuntime(withDefaultPanelRoot(options));
}

function ensureBridge(options = {}) {
    return ensureRuntime(withDefaultPanelRoot(options));
}

function installWandRuntime(electron, options = {}) {
    return installRuntime(electron, withDefaultPanelRoot(options));
}

module.exports = {
    createBridgeRuntime,
    ensureBridge,
    installWandRuntime,
};
