// NOTE: Currently unused. Pro activation lives in the C# asar patch
// (EPatchType.ActivatePro). This renderer-side variant patches the account service
// prototype to inject the Pro subscription at the source. Kept for future use;
// the entry `../activate-pro.js` is excluded from bridge/build.mjs.
import { createLogger } from '../installed-apps-sync/logger.js';
import {
    findExportedConstructor,
    getWebpackRequire,
    isRecord,
} from '../installed-apps-sync/runtime.js';

const GLOBAL_FLAG = '__wandActivateProInstalled';
const SERVICE_PATCH_KEY = '__wandEnhancerProAccountServicePatched';
const ACCOUNT_SERVICE_METHODS = [
    'getUserAccount',
    'setAccountLanguage',
    'setAccountWandBrandExperience',
];
const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 90;
const DEFAULT_SUBSCRIPTION = Object.freeze({ period: 'yearly', state: 'active' });

export function installActivatePro(WandEnhancer) {
    if (globalThis[GLOBAL_FLAG]) {
        return;
    }

    globalThis[GLOBAL_FLAG] = true;

    const state = {
        attempts: 0,
        log: createLogger(WandEnhancer),
    };

    state.log('info', 'Activate Pro bootstrap starting.');
    retryBootstrap(state);
}

function retryBootstrap(state) {
    if (patchAccountService(state)) {
        return;
    }

    state.attempts += 1;
    if (state.attempts < MAX_ATTEMPTS) {
        setTimeout(() => retryBootstrap(state), RETRY_DELAY_MS);
        return;
    }

    state.log('error', 'Activate Pro bootstrap exhausted; account service not found.');
}

function patchAccountService(state) {
    const webpackRequire = getWebpackRequire();
    if (!webpackRequire) {
        return false;
    }

    const ctor = findExportedConstructor(
        webpackRequire,
        (prototype) =>
            typeof prototype.getUserAccount === 'function' &&
            typeof prototype.setAccountLanguage === 'function' &&
            typeof prototype.setAccountWandBrandExperience === 'function',
    );
    if (!ctor?.prototype) {
        return false;
    }

    const prototype = ctor.prototype;
    if (prototype[SERVICE_PATCH_KEY]) {
        return true;
    }

    try {
        for (const name of ACCOUNT_SERVICE_METHODS) {
            const original = prototype[name];
            if (typeof original !== 'function') {
                continue;
            }

            prototype[name] = function patchedAccountMethod(...args) {
                return Promise.resolve(original.apply(this, args)).then((account) =>
                    normalizeProAccount(account),
                );
            };
        }

        Object.defineProperty(prototype, SERVICE_PATCH_KEY, { value: true });
        state.log('info', 'Pro account service patched.');
        return true;
    } catch (error) {
        state.log('warn', 'Failed to patch account service.', error?.stack || String(error));
        return false;
    }
}

function normalizeProAccount(account) {
    if (!isRecord(account)) {
        return account;
    }

    const nextSubscription = normalizeProSubscription(account.subscription);
    if (nextSubscription === account.subscription) {
        return account;
    }

    return {
        ...account,
        subscription: nextSubscription,
    };
}

function normalizeProSubscription(subscription) {
    if (!isRecord(subscription)) {
        return { ...DEFAULT_SUBSCRIPTION };
    }

    const nextSubscription = { ...subscription };
    let changed = false;

    if (typeof nextSubscription.period !== 'string' || !nextSubscription.period.trim()) {
        nextSubscription.period = DEFAULT_SUBSCRIPTION.period;
        changed = true;
    }

    if (nextSubscription.state !== 'active') {
        nextSubscription.state = DEFAULT_SUBSCRIPTION.state;
        changed = true;
    }

    return changed ? nextSubscription : subscription;
}
