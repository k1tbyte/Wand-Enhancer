const KNOWN_CHEAT_TYPES = new Set(['slider', 'number', 'toggle', 'button', 'selection', 'scalar', 'incremental']);
const WEB_CONTRACT = require('../../protocol/web-contract.json');

const WS_OPCODE = Object.freeze({
    TEXT: 1,
    BINARY: 2,
    CLOSE: 8,
    PING: 9,
    PONG: 10,
});

const IPC_CHANNEL = Object.freeze({
    BIND_HANDLER: 'wand-remote-set-handler-bind',
    COMMAND_REQUEST: 'wand-remote-command',
    COMMAND_RESPONSE: 'wand-remote-command-response',
    GAME_STATUS: 'wand-remote-game-status',
    INSTALLED_APPS: 'wand-remote-installed-apps',
    REMOTE_URL: 'wand-remote-url',
    SET_VALUE: 'wand-remote-set-value',
    TRAINER_SNAPSHOT: 'wand-remote-sync',
    VALUE_CHANGED: 'wand-remote-value-changed',
});

module.exports = {
    BRIDGE_LOG_FILE_NAME: 'wand-remote-bridge.log',
    BRIDGE_PROTOCOL_VERSION: WEB_CONTRACT.protocolVersion,
    BRIDGE_SERVER_VERSION: WEB_CONTRACT.serverVersion,
    DEFAULT_REMOTE_HOST: WEB_CONTRACT.defaultRemoteHost,
    DEFAULT_REMOTE_PORT: WEB_CONTRACT.defaultRemotePort,
    DEV_SERVER_PORTS: Object.freeze(WEB_CONTRACT.devServerPorts.map(String)),
    IPC_CHANNEL,
    KNOWN_CHEAT_TYPES,
    MAX_WS_FRAME_BYTES: 1024 * 1024,
    PORT_SCAN_RANGE: WEB_CONTRACT.portScanRange,
    REMOTE_ASSETS_PREFIX: WEB_CONTRACT.assetsPath,
    REMOTE_BASE_PATH: WEB_CONTRACT.basePath,
    REMOTE_COMMAND_REQUEST_CHANNEL: IPC_CHANNEL.COMMAND_REQUEST,
    REMOTE_COMMAND_RESPONSE_CHANNEL: IPC_CHANNEL.COMMAND_RESPONSE,
    REMOTE_COMMAND_RESPONSE_TIMEOUT_MS: 15000,
    REMOTE_GAME_STATUS_CHANNEL: IPC_CHANNEL.GAME_STATUS,
    REMOTE_HEALTH_PATH: WEB_CONTRACT.healthPath,
    REMOTE_INSTALLED_APPS_CHANNEL: IPC_CHANNEL.INSTALLED_APPS,
    REMOTE_WS_PATH: WEB_CONTRACT.webSocketPath,
    RENDERER_INJECTION_DELAYS_MS: Object.freeze([500, 2000]),
    RENDERER_SCRIPT_API_VERSION: 1,
    RENDERER_SCRIPTS_DIR: 'renderer-scripts',
    WS_OPCODE,
};
