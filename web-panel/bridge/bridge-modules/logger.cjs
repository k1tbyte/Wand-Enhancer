const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { BRIDGE_LOG_FILE_NAME } = require('./constants.cjs');

function writeLogLine(logFile, level, message, error) {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    const tag = `[wand-remote-bridge] ${message}`;

    try {
        console[method](tag, error || '');
    } catch { }

    try {
        const detail = error ? ` :: ${error && error.stack ? error.stack : String(error)}` : '';
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] [${level}] ${message}${detail}\n`);
    } catch { }
}

function createBridgeLogger(options = {}) {
    const logFile = options.logFile || path.join(os.tmpdir(), BRIDGE_LOG_FILE_NAME);
    const log = (level, message, error) => writeLogLine(logFile, level, message, error);
    log.file = logFile;
    return log;
}

function writeInstallLog(level, message, error) {
    writeLogLine(path.join(os.tmpdir(), BRIDGE_LOG_FILE_NAME), level, message, error);
}

module.exports = {
    createBridgeLogger,
    writeInstallLog,
};
