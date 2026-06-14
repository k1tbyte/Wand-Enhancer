import type {
  GameStatusPayload,
  InstalledAppSummary,
  InstalledAppsPayload,
  TrainerMetaPayload,
} from '../../protocol/messages';
import { readInitialWebSocketUrl } from './remote-session.urls';

export enum EConnectionStatus {
  Idle = 'idle',
  Connecting = 'connecting',
  Reconnecting = 'reconnecting',
  Connected = 'connected',
  Error = 'error',
}

export type PendingWrite = {
  requestId: string;
  value: unknown;
  previousConfirmedValue: unknown;
};

export type RemoteSessionState = {
  connectionStatus: EConnectionStatus;
  wsUrl: string;
  trainerMeta: TrainerMetaPayload | null;
  gameStatus: GameStatusPayload | null;
  installedApps: InstalledAppSummary[];
  values: Record<string, unknown>;
  confirmedValues: Record<string, unknown>;
  pendingWrites: Record<string, PendingWrite>;
  lastError: string | null;
};

export type RemoteSessionAction =
  | { type: 'setWsUrl'; wsUrl: string }
  | { type: 'connecting'; reconnecting?: boolean }
  | { type: 'connected' }
  | { type: 'connectionClosed'; message: string }
  | { type: 'disconnected' }
  | { type: 'trainerMeta'; payload: TrainerMetaPayload }
  | { type: 'gameStatus'; payload: GameStatusPayload }
  | { type: 'installedApps'; payload: InstalledAppsPayload }
  | { type: 'trainerValues'; payload: Record<string, unknown> }
  | { type: 'valueChanged'; target: string; value: unknown }
  | { type: 'writeStarted'; target: string; value: unknown; requestId: string }
  | { type: 'writeResult'; target: string; requestId: string | null; ok: boolean; message?: string }
  | { type: 'trainerChanged' }
  | { type: 'error'; message: string | null };

export function createInitialRemoteSessionState(): RemoteSessionState {
  return {
    connectionStatus: EConnectionStatus.Idle,
    wsUrl: readInitialWebSocketUrl(),
    trainerMeta: null,
    gameStatus: null,
    installedApps: [],
    values: {},
    confirmedValues: {},
    pendingWrites: {},
    lastError: null,
  };
}

export function remoteSessionReducer(
  state: RemoteSessionState,
  action: RemoteSessionAction,
): RemoteSessionState {
  switch (action.type) {
    case 'setWsUrl':
      return { ...state, wsUrl: action.wsUrl };
    case 'connecting':
      return {
        ...state,
        connectionStatus: action.reconnecting ? EConnectionStatus.Reconnecting : EConnectionStatus.Connecting,
        lastError: null,
      };
    case 'connected':
      return { ...state, connectionStatus: EConnectionStatus.Connected, lastError: null };
    case 'connectionClosed':
      return {
        ...state,
        connectionStatus: EConnectionStatus.Reconnecting,
        pendingWrites: {},
        lastError: action.message,
      };
    case 'disconnected':
      return {
        ...state,
        connectionStatus: EConnectionStatus.Idle,
        trainerMeta: null,
        gameStatus: null,
        values: {},
        confirmedValues: {},
        pendingWrites: {},
        lastError: null,
      };
    case 'trainerMeta':
      return { ...state, trainerMeta: action.payload, pendingWrites: {} };
    case 'gameStatus':
      return { ...state, gameStatus: action.payload };
    case 'installedApps':
      return { ...state, installedApps: action.payload.apps };
    case 'trainerValues':
      return {
        ...state,
        values: action.payload,
        confirmedValues: action.payload,
        pendingWrites: {},
      };
    case 'valueChanged':
      return applyConfirmedValue(state, action.target, action.value);
    case 'writeStarted':
      return {
        ...state,
        values: { ...state.values, [action.target]: action.value },
        pendingWrites: {
          ...state.pendingWrites,
          [action.target]: {
            requestId: action.requestId,
            value: action.value,
            previousConfirmedValue: state.confirmedValues[action.target],
          },
        },
      };
    case 'writeResult':
      return applyWriteResult(state, action);
    case 'trainerChanged':
      return {
        ...state,
        trainerMeta: null,
        values: {},
        confirmedValues: {},
        pendingWrites: {},
      };
    case 'error':
      return {
        ...state,
        connectionStatus: action.message && state.connectionStatus !== EConnectionStatus.Connected
          ? EConnectionStatus.Error
          : state.connectionStatus,
        lastError: action.message,
      };
  }
}

function applyConfirmedValue(
  state: RemoteSessionState,
  target: string,
  value: unknown,
): RemoteSessionState {
  const pending = state.pendingWrites[target];
  const pendingWrites = { ...state.pendingWrites };
  if (pending && Object.is(pending.value, value)) {
    delete pendingWrites[target];
  }

  return {
    ...state,
    values: { ...state.values, [target]: value },
    confirmedValues: { ...state.confirmedValues, [target]: value },
    pendingWrites,
  };
}

function applyWriteResult(
  state: RemoteSessionState,
  action: Extract<RemoteSessionAction, { type: 'writeResult' }>,
): RemoteSessionState {
  const pending = state.pendingWrites[action.target];
  if (!pending || !action.requestId || pending.requestId !== action.requestId) {
    return state;
  }

  const pendingWrites = { ...state.pendingWrites };
  delete pendingWrites[action.target];

  if (action.ok) {
    return {
      ...state,
      confirmedValues: { ...state.confirmedValues, [action.target]: pending.value },
      pendingWrites,
    };
  }

  return {
    ...state,
    values: { ...state.values, [action.target]: pending.previousConfirmedValue },
    pendingWrites,
    lastError: action.message ?? 'The trainer rejected the requested value.',
  };
}
