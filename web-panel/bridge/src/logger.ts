const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { BRIDGE_LOG_FILE_NAME } = require('./constants');

import type { BridgeLogger, BridgeOptions, LogLevel } from './types';

function writeLogLine(logFile: string, level: LogLevel, message: string, error?: unknown) {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    const tag = `[wand-remote-bridge] ${message}`;

    // Logging runs inside Wand's own process; a failure here must never take the app down.
    try {
        console[method](tag, error || '');
    } catch {}

    try {
        const detail = error
            ? ` :: ${error && typeof error === 'object' && 'stack' in error ? String(error.stack) : String(error)}`
            : '';
        fs.appendFileSync(
            logFile,
            `[${new Date().toISOString()}] [${level}] ${message}${detail}\n`,
        );
    } catch {}
}

function createBridgeLogger(options: BridgeOptions = {}): BridgeLogger {
    const logFile = options.logFile || path.join(os.tmpdir(), BRIDGE_LOG_FILE_NAME);
    const log = ((level: LogLevel, message: string, error?: unknown) =>
        writeLogLine(logFile, level, message, error)) as BridgeLogger;
    log.file = logFile;
    return log;
}

function writeInstallLog(level: LogLevel, message: string, error?: unknown) {
    writeLogLine(path.join(os.tmpdir(), BRIDGE_LOG_FILE_NAME), level, message, error);
}

module.exports = {
    createBridgeLogger,
    writeInstallLog,
};
