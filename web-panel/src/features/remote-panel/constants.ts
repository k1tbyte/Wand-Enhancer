export const DEFAULT_REMOTE_PORT = 3223;
export const REMOTE_BASE_PATH = '/remote/';
export const REMOTE_WS_PATH = '/remote/ws';
export const CLIENT_VERSION = '0.2.0';
export const WS_QUERY_PARAM = 'ws';

const DEV_SERVER_PORTS = new Set(['4173', '5173']);

function protocolForWebSocket(): 'ws' | 'wss' {
  return window.location.protocol === 'https:' ? 'wss' : 'ws';
}

function isServedByRemoteBridge(): boolean {
  return window.location.pathname.startsWith(REMOTE_BASE_PATH) && !DEV_SERVER_PORTS.has(window.location.port);
}

export function readInitialRemoteUrl(): string {
  if (isServedByRemoteBridge()) {
    return `${window.location.protocol}//${window.location.host}${REMOTE_BASE_PATH}`;
  }

  return `http://127.0.0.1:${DEFAULT_REMOTE_PORT}${REMOTE_BASE_PATH}`;
}

export function readInitialWebSocketUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const explicitUrl = params.get(WS_QUERY_PARAM)?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  if (isServedByRemoteBridge()) {
    return `${protocolForWebSocket()}://${window.location.host}${REMOTE_WS_PATH}`;
  }

  return `ws://127.0.0.1:${DEFAULT_REMOTE_PORT}${REMOTE_WS_PATH}`;
}
