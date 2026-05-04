import { readInitialRemoteUrl, readInitialWebSocketUrl } from './constants';
import type { GameStatusPayload, InstalledAppSummary, InstalledAppsPayload, TrainerMetaPayload } from './protocol';

export enum EConnectionStatus {
    Idle = 'idle',
    Connecting = 'connecting',
    Connected = 'connected',
    Error = 'error',
}

export type PanelState = {
    connectionStatus: EConnectionStatus;
    wsUrl: string;
    remoteUrl: string;
    trainerMeta: TrainerMetaPayload | null;
    gameStatus: GameStatusPayload | null;
    installedApps: InstalledAppSummary[];
    installedAppsUpdatedAt: string | null;
    values: Record<string, unknown>;
    pendingTargets: Record<string, boolean>;
    pinnedTargets: Record<string, true>;
    lastError: string | null;
};

export type PanelAction =
    | { type: 'setWsUrl'; wsUrl: string }
    | { type: 'setRemoteUrl'; remoteUrl: string }
    | { type: 'connecting' }
    | { type: 'connected' }
    | { type: 'disconnected' }
    | { type: 'trainerMeta'; payload: TrainerMetaPayload }
    | { type: 'gameStatus'; payload: GameStatusPayload }
    | { type: 'installedApps'; payload: InstalledAppsPayload }
    | { type: 'trainerValues'; payload: Record<string, unknown> }
    | { type: 'valueChanged'; target: string; value: unknown }
    | { type: 'setPending'; target: string; pending: boolean }
    | { type: 'trainerChanged' }
    | { type: 'setPinnedTargets'; pinned: Record<string, true> }
    | { type: 'togglePinnedTarget'; target: string }
    | { type: 'error'; message: string | null };

export function createInitialPanelState(): PanelState {
    return {
        connectionStatus: EConnectionStatus.Idle,
        wsUrl: readInitialWebSocketUrl(),
        remoteUrl: readInitialRemoteUrl(),
        trainerMeta: null,
        gameStatus: null,
        installedApps: [],
        installedAppsUpdatedAt: null,
        values: {},
        pendingTargets: {},
        pinnedTargets: {},
        lastError: null,
    };
}

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
    switch (action.type) {
        case 'setWsUrl':
            return {
                ...state,
                wsUrl: action.wsUrl,
            };
        case 'setRemoteUrl':
            return {
                ...state,
                remoteUrl: action.remoteUrl,
            };
        case 'connecting':
            return {
                ...state,
                connectionStatus: EConnectionStatus.Connecting,
                lastError: null,
            };
        case 'connected':
            return {
                ...state,
                connectionStatus: EConnectionStatus.Connected,
                lastError: null,
            };
        case 'disconnected':
            return {
                ...state,
                connectionStatus: EConnectionStatus.Idle,
                trainerMeta: null,
                gameStatus: null,
                values: {},
                pendingTargets: {},
                lastError: null,
            };
        case 'trainerMeta':
            return {
                ...state,
                trainerMeta: action.payload,
                pendingTargets: {},
            };
        case 'gameStatus':
            return {
                ...state,
                gameStatus: action.payload,
            };
        case 'installedApps':
            return {
                ...state,
                installedApps: action.payload.apps,
                installedAppsUpdatedAt: action.payload.updatedAt,
            };
        case 'trainerValues':
            return {
                ...state,
                values: action.payload,
            };
        case 'valueChanged':
            return {
                ...state,
                values: {
                    ...state.values,
                    [action.target]: action.value,
                },
                pendingTargets: {
                    ...state.pendingTargets,
                    [action.target]: false,
                },
            };
        case 'setPending':
            return {
                ...state,
                pendingTargets: {
                    ...state.pendingTargets,
                    [action.target]: action.pending,
                },
            };
        case 'trainerChanged':
            return {
                ...state,
                trainerMeta: null,
                values: {},
                pendingTargets: {},
                pinnedTargets: {},
            };
        case 'setPinnedTargets':
            return {
                ...state,
                pinnedTargets: action.pinned,
            };
        case 'togglePinnedTarget': {
            const next = { ...state.pinnedTargets };
            if (next[action.target]) {
                delete next[action.target];
            } else {
                next[action.target] = true;
            }
            return {
                ...state,
                pinnedTargets: next,
            };
        }
        case 'error':
            return {
                ...state,
                connectionStatus: action.message && state.connectionStatus !== EConnectionStatus.Connected ? EConnectionStatus.Error : state.connectionStatus,
                lastError: action.message,
            };
    }
}
