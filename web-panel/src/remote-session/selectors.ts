import { EConnectionStatus, type RemoteSessionState } from './remote-session.reducer';

export function selectIsConnected(state: RemoteSessionState): boolean {
  return state.connectionStatus === EConnectionStatus.Connected;
}

export function selectPendingTargets(state: RemoteSessionState): Record<string, boolean> {
  return Object.fromEntries(Object.keys(state.pendingWrites).map((target) => [target, true]));
}
