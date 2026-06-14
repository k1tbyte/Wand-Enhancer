import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, type HelloAckMessage } from '../../protocol/messages';
import { protocolAction } from './remote-session.protocol';
import {
  createInitialRemoteSessionState,
  EConnectionStatus,
  remoteSessionReducer,
  type RemoteSessionState,
} from './remote-session.reducer';

describe('remote session protocol', () => {
  it('connects only after an accepted compatible hello acknowledgement', () => {
    const action = protocolAction(helloAck(PROTOCOL_VERSION));
    expect(action).toEqual({ type: 'connected' });
  });

  it('rejects a protocol version mismatch', () => {
    const action = protocolAction(helloAck(PROTOCOL_VERSION + 1));
    expect(action).toEqual({
      type: 'error',
      message: `Protocol mismatch: bridge=${PROTOCOL_VERSION + 1}, panel=${PROTOCOL_VERSION}.`,
    });
  });
});

describe('remote session reducer', () => {
  it('enters reconnecting state after an unexpected close', () => {
    const state = { ...initialState(), connectionStatus: EConnectionStatus.Connected };
    const next = remoteSessionReducer(state, { type: 'connectionClosed', message: 'closed' });

    expect(next.connectionStatus).toBe(EConnectionStatus.Reconnecting);
    expect(next.lastError).toBe('closed');
  });

  it('applies snapshots and clears trainer data on trainer switch', () => {
    let state = remoteSessionReducer(initialState(), { type: 'trainerValues', payload: { speed: 2 } });
    state = remoteSessionReducer(state, { type: 'valueChanged', target: 'speed', value: 3 });
    expect(state.values.speed).toBe(3);

    state = remoteSessionReducer(state, { type: 'trainerChanged' });
    expect(state.values).toEqual({});
    expect(state.pendingWrites).toEqual({});
  });

  it('keeps a write pending until result and commits a successful result', () => {
    let state = withConfirmedValue(1);
    state = remoteSessionReducer(state, { type: 'writeStarted', target: 'speed', value: 2, requestId: 'new' });
    expect(state.values.speed).toBe(2);
    expect(state.pendingWrites.speed?.requestId).toBe('new');

    state = remoteSessionReducer(state, { type: 'writeResult', target: 'speed', requestId: 'new', ok: true });
    expect(state.confirmedValues.speed).toBe(2);
    expect(state.pendingWrites.speed).toBeUndefined();
  });

  it('clears a write after a matching value delta', () => {
    let state = withConfirmedValue(false);
    state = remoteSessionReducer(state, { type: 'writeStarted', target: 'speed', value: true, requestId: 'new' });
    state = remoteSessionReducer(state, { type: 'valueChanged', target: 'speed', value: true });

    expect(state.pendingWrites.speed).toBeUndefined();
    expect(state.confirmedValues.speed).toBe(true);
  });

  it('rolls back only the current rejected request', () => {
    let state = withConfirmedValue(1);
    state = remoteSessionReducer(state, { type: 'writeStarted', target: 'speed', value: 2, requestId: 'old' });
    state = remoteSessionReducer(state, { type: 'writeStarted', target: 'speed', value: 3, requestId: 'new' });
    state = remoteSessionReducer(state, { type: 'writeResult', target: 'speed', requestId: 'old', ok: false });
    expect(state.values.speed).toBe(3);
    expect(state.pendingWrites.speed?.requestId).toBe('new');

    state = remoteSessionReducer(state, { type: 'writeResult', target: 'speed', requestId: 'new', ok: false });
    expect(state.values.speed).toBe(1);
    expect(state.pendingWrites.speed).toBeUndefined();
  });
});

function helloAck(protocolVersion: number): HelloAckMessage {
  return {
    type: 'hello_ack',
    version: PROTOCOL_VERSION,
    requestId: 'hello',
    payload: {
      sessionId: 'session',
      accepted: true,
      serverVersion: 'test',
      protocolVersion,
    },
  };
}

function initialState(): RemoteSessionState {
  return { ...createInitialRemoteSessionState(), wsUrl: 'ws://test' };
}

function withConfirmedValue(value: unknown): RemoteSessionState {
  return {
    ...initialState(),
    values: { speed: value },
    confirmedValues: { speed: value },
  };
}
