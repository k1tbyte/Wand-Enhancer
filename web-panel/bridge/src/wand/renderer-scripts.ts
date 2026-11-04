const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
    RENDERER_INJECTION_DELAYS_MS,
    RENDERER_SCRIPT_API_VERSION,
    RENDERER_SCRIPTS_DIR,
} = require('../constants');
const { writeInstallLog } = require('../logger');

import type { BridgeOptions, ElectronPort, LogLevel, WebContentsPort } from '../types';

declare global {
    var __wandRemoteBridgeRendererScriptsInstalled: boolean | undefined;
}

type RendererScript = { name: string; source: string };
type InstallLog = (level: LogLevel, message: string, error?: unknown) => void;

// Lines wrapRendererScript puts before the source, so compile errors point at the script's own lines.
const WRAPPER_LINES_BEFORE_SOURCE = 3;

function loadRendererScripts(
    panelRoot: string,
    scriptsRoot?: string,
    log: InstallLog = writeInstallLog,
): RendererScript[] {
    const root = scriptsRoot || path.join(panelRoot, RENDERER_SCRIPTS_DIR);
    if (!fs.existsSync(root)) {
        return [];
    }

    return fs
        .readdirSync(root)
        .filter((name: string) => name.endsWith('.js'))
        .sort((left: string, right: string) => left.localeCompare(right))
        .map((name: string) =>
            replaceIfUncompilable(
                { name, source: fs.readFileSync(path.join(root, name), 'utf8') },
                log,
            ),
        );
}

/**
 * All scripts share one injected bootstrap, so a script that does not parse would stop every other one.
 * It is swapped for a warning that also reaches the Wand DevTools console.
 */
function replaceIfUncompilable(script: RendererScript, log: InstallLog): RendererScript {
    try {
        new vm.Script(wrapRendererScript(script), {
            filename: script.name,
            lineOffset: -WRAPPER_LINES_BEFORE_SOURCE,
        });
        return script;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        // V8 puts "<filename>:<line>" first in a compile error's stack.
        const firstStackLine = error instanceof Error ? error.stack?.split('\n')[0] : undefined;
        const location = firstStackLine?.startsWith(script.name) ? firstStackLine : script.name;
        const message = `Renderer script ${location} skipped, it does not compile: ${reason}`;
        log('warn', message);
        return {
            name: script.name,
            source: `console.warn(${JSON.stringify(`[wand-remote-bridge] ${message}`)});`,
        };
    }
}

function wrapRendererScript(script: RendererScript) {
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
}

function buildRendererBootstrap(remoteUrl: string, scripts: RendererScript[]) {
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

    const body = scripts.map(wrapRendererScript).join('\n');

    return `(() => {\n${header}\n${body}\n})();`;
}

function installRendererScripts(
    electron: ElectronPort,
    runtime: { remoteUrl: string },
    options: BridgeOptions & { scriptsRoot?: string } = {},
) {
    if (globalThis.__wandRemoteBridgeRendererScriptsInstalled) {
        return;
    }

    globalThis.__wandRemoteBridgeRendererScriptsInstalled = true;
    const scripts = loadRendererScripts(
        options.panelRoot || path.dirname(__dirname),
        options.scriptsRoot,
    );
    if (scripts.length === 0) {
        writeInstallLog('info', 'No renderer scripts found.');
        return;
    }

    electron.app.on('web-contents-created', (_event: unknown, contents: WebContentsPort) => {
        const inject = () => {
            if (!contents || contents.isDestroyed()) {
                return;
            }

            contents
                .executeJavaScript(buildRendererBootstrap(runtime.remoteUrl, scripts), true)
                .catch((error: unknown) =>
                    writeInstallLog('warn', 'Failed to inject renderer scripts.', error),
                );
        };

        contents.on('dom-ready', inject);
        contents.on('did-finish-load', inject);
        for (const delayMs of RENDERER_INJECTION_DELAYS_MS) {
            setTimeout(inject, delayMs);
        }
    });

    writeInstallLog(
        'info',
        `Renderer script injection installed (${scripts.map((script: { name: string }) => script.name).join(', ')}).`,
    );
}

module.exports = {
    buildRendererBootstrap,
    installRendererScripts,
    loadRendererScripts,
};
