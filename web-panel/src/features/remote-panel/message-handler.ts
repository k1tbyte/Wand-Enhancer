import type { IncomingMessage, TrainerMetaPayload } from './protocol';
import { normalizeIncomingValue } from './protocol';
import type { PanelAction } from './state';

type Dispatch = (action: PanelAction) => void;

export function handleProtocolMessage(dispatch: Dispatch, message: IncomingMessage, trainerMeta: TrainerMetaPayload | null): void {
  switch (message.type) {
    case 'hello_ack':
      handleHelloAck(dispatch, message.payload.accepted, message.payload.remoteUrl);
      return;
    case 'trainer_meta':
      dispatch({ type: 'trainerMeta', payload: message.payload });
      return;
    case 'trainer_values':
      dispatch({ type: 'trainerValues', payload: message.payload.values });
      return;
    case 'value_changed':
      handleValueChanged(dispatch, message, trainerMeta);
      return;
    case 'trainer_changed':
      dispatch({ type: 'trainerChanged' });
      return;
    case 'set_value_result':
      if (!message.payload.ok) {
        dispatch({ type: 'error', message: message.payload.error?.message ?? 'The trainer rejected the requested value.' });
      }
      return;
    case 'error':
      dispatch({ type: 'error', message: message.payload.message });
      return;
  }
}

function handleHelloAck(dispatch: Dispatch, accepted: boolean, remoteUrl?: string): void {
  if (!accepted) {
    dispatch({ type: 'error', message: 'The desktop bridge rejected the connection.' });
    return;
  }

  if (remoteUrl) {
    dispatch({ type: 'setRemoteUrl', remoteUrl });
  }
}

function handleValueChanged(dispatch: Dispatch, message: Extract<IncomingMessage, { type: 'value_changed' }>, trainerMeta: TrainerMetaPayload | null): void {
  const cheat = trainerMeta?.schema.cheats.find((item) => item.target === message.payload.target || item.uuid === message.payload.cheatId);
  const nextValue = cheat ? normalizeIncomingValue(cheat, message.payload.value) : message.payload.value;
  dispatch({ type: 'valueChanged', target: message.payload.target, value: nextValue });
}
