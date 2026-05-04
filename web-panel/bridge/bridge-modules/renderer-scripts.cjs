const fs = require('node:fs');
const path = require('node:path');

const { RENDERER_INJECTION_DELAYS_MS, RENDERER_SCRIPT_API_VERSION, RENDERER_SCRIPTS_DIR } = require('./constants.cjs');
const { writeInstallLog } = require('./logger.cjs');

function loadRendererScripts(panelRoot, scriptsRoot) {
    const root = scriptsRoot || path.join(panelRoot, RENDERER_SCRIPTS_DIR);
    if (!fs.existsSync(root)) {
        return [];
    }

    return fs.readdirSync(root)
        .filter((name) => name.endsWith('.js'))
        .sort((left, right) => left.localeCompare(right))
        .map((name) => ({
            name,
            source: fs.readFileSync(path.join(root, name), 'utf8'),
        }));
}

function buildRendererBootstrap(remoteUrl, scripts) {
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

    const body = scripts.map((script) => {
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
    }).join('\n');

    return `(() => {\n${header}\n${body}\n})();`;
}

function installRendererScripts(electron, runtime, options = {}) {
    if (globalThis.__wandRemoteBridgeRendererScriptsInstalled) {
        return;
    }

    globalThis.__wandRemoteBridgeRendererScriptsInstalled = true;
    const scripts = loadRendererScripts(options.panelRoot || path.dirname(__dirname), options.scriptsRoot);
    if (scripts.length === 0) {
        writeInstallLog('info', 'No renderer scripts found.');
        return;
    }

    electron.app.on('web-contents-created', (_event, contents) => {
        const inject = () => {
            if (!contents || contents.isDestroyed()) {
                return;
            }

            contents.executeJavaScript(buildRendererBootstrap(runtime.remoteUrl, scripts), true)
                .catch((error) => writeInstallLog('warn', 'Failed to inject renderer scripts.', error));
        };

        contents.on('dom-ready', inject);
        contents.on('did-finish-load', inject);
        for (const delayMs of RENDERER_INJECTION_DELAYS_MS) {
            setTimeout(inject, delayMs);
        }
    });

    writeInstallLog('info', `Renderer script injection installed (${scripts.map((script) => script.name).join(', ')}).`);
}

module.exports = {
    buildRendererBootstrap,
    installRendererScripts,
    loadRendererScripts,
};
