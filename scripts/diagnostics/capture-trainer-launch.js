// Paste into Wand's DevTools Console before reproducing a trainer launch failure.
// Observes lifecycle events only; refresh/restart Wand to remove the subscriptions.
(() => {
    const guard = '__wandTrainerLaunchDiagnostics';
    if (globalThis[guard]) return console.info('Trainer diagnostics already installed.');
    const chunk = globalThis.webpackChunkWeMod;
    if (!Array.isArray(chunk)) throw new Error('Run this in the main Wand renderer Console.');
    let runtime;
    chunk.push([[`trainer-diagnostics-${Date.now()}`], {}, (value) => { runtime = value; }]);
    if (!runtime?.c) throw new Error('Wand webpack cache is unavailable.');

    const containers = new Set();
    if (globalThis.aurelia?.container) containers.add(globalThis.aurelia.container);
    for (const element of [document.body, ...document.querySelectorAll('*')]) {
        if (element?.__aurelia__?.container) containers.add(element.__aurelia__.container);
        if (element?.au?.container) containers.add(element.au.container);
        for (const entry of Object.values(element?.au ?? {})) {
            const container = entry?.container || entry?.controller?.container
                || entry?.viewModel?.container || entry?.controller?.viewModel?.container;
            if (container) containers.add(container);
        }
    }

    let service;
    for (const record of Object.values(runtime.c)) {
        const exports = record?.exports;
        const candidates = typeof exports === 'function' ? [exports] : Object.values(exports ?? {});
        for (const candidate of candidates) {
            const prototype = candidate?.prototype;
            if (!['launch', 'endTrainer', 'onNewTrainer', 'onTrainerEnded'].every(
                (name) => typeof prototype?.[name] === 'function',
            )) continue;
            for (const container of containers) {
                try { service = container.get(candidate); } catch { continue; }
                if (service) break;
            }
            if (service) break;
        }
        if (service) break;
    }
    if (!service) throw new Error('Trainer service not found. Open the game page and try again.');

    function snapshot(event, trainer) {
        try {
            const error = trainer?.launchError;
            // Deliberately avoid serializing account, store, launch requests or network data.
            const details = {
                event,
                time: new Date().toISOString(),
                backend: trainer?.backend ?? null,
                launchResult: trainer?.launchResult ?? null,
                finalState: trainer?.finalState ?? null,
                launchDuration: trainer?.launchDuration ?? null,
                error: error ? {
                    name: error.name ?? error.constructor?.name ?? null,
                    code: error.code ?? null,
                    message: String(error.message ?? error).slice(0, 2000)
                        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
                        .replace(/([?&](?:token|access_token|key)=)[^&\s]*/gi, '$1[redacted]'),
                } : null,
            };
            console.info('[trainer-diagnostics]', JSON.stringify(details));
        } catch (error) {
            console.warn('[trainer-diagnostics] Could not read trainer status:', error.name);
        }
    }

    const subscriptions = [];
    subscriptions.push(service.onNewTrainer((trainer) => snapshot('created', trainer)));
    subscriptions.push(service.onTrainerEnded((trainer) => snapshot('ended', trainer)));
    globalThis[guard] = { subscriptions };
    console.info('[trainer-diagnostics] Ready. Press Play, then copy the created/ended lines.');
})();
