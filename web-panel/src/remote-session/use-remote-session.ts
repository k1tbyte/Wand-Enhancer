import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import type { CheatSchema, InstalledAppSummary } from '../../protocol/messages';
import { normalizeCheatValue } from '../trainer/model/values';
import { RemoteSessionClient } from './remote-session.client';
import { protocolAction } from './remote-session.protocol';
import {
    createInitialRemoteSessionState,
    EConnectionStatus,
    type RemoteSessionState,
    remoteSessionReducer,
} from './remote-session.reducer';
import { selectIsConnected, selectPendingTargets } from './selectors';

const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

export function useRemoteSession() {
    const [state, dispatch] = useReducer(
        remoteSessionReducer,
        undefined,
        createInitialRemoteSessionState,
    );
    const stateRef = useRef(state);
    const clientRef = useRef<RemoteSessionClient | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptRef = useRef(0);
    // Set when the user disconnects on purpose, so refocus does not silently reconnect.
    const userDisconnectedRef = useRef(false);
    const connectRef = useRef<() => void>(() => {});
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const clearReconnect = useCallback(() => {
        if (reconnectTimeoutRef.current !== null) {
            window.clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    }, []);

    const scheduleReconnect = useCallback(() => {
        clearReconnect();
        if (document.visibilityState !== 'visible' || userDisconnectedRef.current) {
            return;
        }

        // Back off: the bridge is usually down because Wand is closed, and a phone
        // retrying every 2s until the tab is hidden drains the battery for nothing.
        const delay = Math.min(
            RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptRef.current,
            RECONNECT_MAX_DELAY_MS,
        );
        reconnectAttemptRef.current += 1;

        reconnectTimeoutRef.current = window.setTimeout(() => {
            if (document.visibilityState === 'visible' && stateRef.current.wsUrl.trim()) {
                connectRef.current();
            }
        }, delay);
    }, [clearReconnect]);

    const connect = useCallback(() => {
        clientRef.current?.disconnect();
        clearReconnect();
        userDisconnectedRef.current = false;

        const wsUrl = stateRef.current.wsUrl.trim();
        if (!wsUrl) {
            dispatch({ type: 'error', message: 'Enter a WebSocket URL first.' });
            return;
        }

        const client = new RemoteSessionClient(wsUrl, {
            onConnecting: () =>
                dispatch({
                    type: 'connecting',
                    reconnecting:
                        stateRef.current.connectionStatus === EConnectionStatus.Reconnecting,
                }),
            onTransportOpen: () => {
                reconnectAttemptRef.current = 0;
            },
            onMessage: (message) => {
                const action = protocolAction(message);
                if (!action) return;
                dispatch(action);
            },
            onClose: () => {
                dispatch({
                    type: 'connectionClosed',
                    message: 'The WebSocket connection closed. Reconnecting...',
                });
                scheduleReconnect();
            },
            onError: (message) => dispatch({ type: 'error', message }),
        });

        clientRef.current = client;
        client.connect();
    }, [clearReconnect, scheduleReconnect]);

    const disconnect = useCallback(() => {
        userDisconnectedRef.current = true;
        reconnectAttemptRef.current = 0;
        clearReconnect();
        clientRef.current?.disconnect();
        clientRef.current = null;
        dispatch({ type: 'disconnected' });
    }, [clearReconnect]);

    const setWsUrl = useCallback((wsUrl: string) => dispatch({ type: 'setWsUrl', wsUrl }), []);
    const reportError = useCallback(
        (message: string | null) => dispatch({ type: 'error', message }),
        [],
    );

    const changeCheat = useCallback((cheat: CheatSchema, nextValue: unknown) => {
        const current = stateRef.current;
        if (current.connectionStatus !== EConnectionStatus.Connected || !current.trainerMeta) {
            dispatch({ type: 'error', message: 'The bridge socket is not connected.' });
            return false;
        }

        const value = normalizeCheatValue(cheat, nextValue);
        const requestId =
            clientRef.current?.setValue(
                current.trainerMeta.trainer.trainerId,
                cheat.target,
                value,
                cheat.uuid,
            ) ?? null;
        if (!requestId) {
            dispatch({ type: 'error', message: 'The bridge socket is not open.' });
            return false;
        }

        dispatch({ type: 'writeStarted', target: cheat.target, value, requestId });
        return true;
    }, []);

    const launchGame = useCallback((app: InstalledAppSummary): boolean => {
        if (!app.gameId) {
            dispatch({
                type: 'error',
                message: 'This My Games entry does not expose a Wand game id.',
            });
            return false;
        }
        if (!isReadyToSend(stateRef.current, clientRef.current)) {
            dispatch({ type: 'error', message: 'The bridge socket is not connected.' });
            return false;
        }
        if (!clientRef.current?.launchGame(app.gameId, app.titleId ?? undefined)) {
            dispatch({
                type: 'error',
                message: 'Failed to send the launch command to the bridge.',
            });
            return false;
        }
        return true;
    }, []);

    const stopPlaying = useCallback(() => {
        const current = stateRef.current;
        if (!isReadyToSend(current, clientRef.current)) {
            dispatch({ type: 'error', message: 'The bridge socket is not connected.' });
            return;
        }
        const gameId =
            current.gameStatus?.session.gameId ?? current.gameStatus?.trainer.gameId ?? undefined;
        const titleId =
            current.gameStatus?.session.titleId ?? current.gameStatus?.trainer.titleId ?? undefined;
        if (!clientRef.current?.stopPlaying(gameId, titleId)) {
            dispatch({ type: 'error', message: 'Failed to send the stop command to the bridge.' });
        }
    }, []);

    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState !== 'visible' || userDisconnectedRef.current) {
                return;
            }
            if (!clientRef.current?.isOpen()) {
                connectRef.current();
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    useEffect(() => {
        if (stateRef.current.wsUrl.trim()) {
            connectRef.current();
        }
        return () => {
            clearReconnect();
            clientRef.current?.disconnect();
            clientRef.current = null;
        };
    }, [clearReconnect]);

    const connected = selectIsConnected(state);
    const pendingTargets = useMemo(() => selectPendingTargets(state), [state]);

    return {
        state,
        connected,
        pendingTargets,
        connect,
        disconnect,
        setWsUrl,
        reportError,
        changeCheat,
        launchGame,
        stopPlaying,
    };
}

function isReadyToSend(state: RemoteSessionState, client: RemoteSessionClient | null): boolean {
    return state.connectionStatus === EConnectionStatus.Connected && Boolean(client?.isOpen());
}
