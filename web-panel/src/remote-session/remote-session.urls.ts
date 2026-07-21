import { WEB_CONTRACT } from '../../protocol/contract';

export const WS_QUERY_PARAM = 'ws';

const DEV_SERVER_PORTS = new Set(WEB_CONTRACT.devServerPorts.map(String));

function protocolForWebSocket(): 'ws' | 'wss' {
  return window.location.protocol === 'https:' ? 'wss' : 'ws';
}

function isServedByRemoteBridge(): boolean {
  return window.location.pathname.startsWith(WEB_CONTRACT.basePath) && !DEV_SERVER_PORTS.has(window.location.port);
}

export function readInitialWebSocketUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const explicitUrl = params.get(WS_QUERY_PARAM)?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  if (isServedByRemoteBridge()) {
    return `${protocolForWebSocket()}://${window.location.host}${WEB_CONTRACT.webSocketPath}`;
  }

  return `ws://127.0.0.1:${WEB_CONTRACT.defaultRemotePort}${WEB_CONTRACT.webSocketPath}`;
}
