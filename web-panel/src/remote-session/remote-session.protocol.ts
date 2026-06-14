import { PROTOCOL_VERSION, type IncomingMessage } from '../../protocol/messages';
import type { RemoteSessionAction } from './remote-session.reducer';

export function protocolAction(message: IncomingMessage): RemoteSessionAction | null {
  switch (message.type) {
    case 'hello_ack':
      if (!message.payload.accepted) {
        return { type: 'error', message: 'The desktop bridge rejected the connection.' };
      }
      if (message.payload.protocolVersion !== PROTOCOL_VERSION) {
        return {
          type: 'error',
          message: `Protocol mismatch: bridge=${message.payload.protocolVersion}, panel=${PROTOCOL_VERSION}.`,
        };
      }
      return { type: 'connected' };
    case 'trainer_meta':
      return { type: 'trainerMeta', payload: message.payload };
    case 'game_status':
      return { type: 'gameStatus', payload: message.payload };
    case 'installed_apps':
      return { type: 'installedApps', payload: message.payload };
    case 'trainer_values':
      return { type: 'trainerValues', payload: message.payload.values };
    case 'value_changed':
      return { type: 'valueChanged', target: message.payload.target, value: message.payload.value };
    case 'trainer_changed':
      return { type: 'trainerChanged' };
    case 'set_value_result':
      return {
        type: 'writeResult',
        target: message.payload.target,
        requestId: message.requestId,
        ok: message.payload.ok,
        message: message.payload.error?.message,
      };
    case 'remote_command_result':
      return message.payload.ok
        ? null
        : { type: 'error', message: message.payload.error?.message ?? 'The remote game command was rejected.' };
    case 'error':
      return { type: 'error', message: message.payload.message };
  }
}
