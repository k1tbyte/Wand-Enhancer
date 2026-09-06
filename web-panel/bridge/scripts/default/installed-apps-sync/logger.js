import { LOG_FILE_NAME, LOG_PREFIX } from './constants.js';
import { getRequire } from './runtime.js';

// Logging runs inside Wand's own process; a failure here must never take the app down.
export function createLogger(WandEnhancer) {
    let filePath = null;

    try {
        const require = getRequire();
        const os = require?.('node:os');
        const path = require?.('node:path');
        if (os && path) {
            filePath = path.join(os.tmpdir(), LOG_FILE_NAME);
            globalThis.__wandInstalledAppsSyncLogFile = filePath;
        }
    } catch {}

    return function log(level, message, detail) {
        const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
        const line = `[${new Date().toISOString()}] [${level}] ${message}${detail ? ` :: ${detail}` : ''}`;

        try {
            console[method](LOG_PREFIX, message, detail || '');
        } catch {}

        try {
            if (WandEnhancer?.log) {
                WandEnhancer.log(`${LOG_PREFIX} ${message}`, detail || '');
            }
        } catch {}

        writeFile(filePath, line);
    };
}

function writeFile(filePath, line) {
    if (!filePath) {
        return;
    }

    try {
        const require = getRequire();
        const fs = require?.('node:fs');
        fs?.appendFileSync(filePath, `${line}\n`);
    } catch {}
}
