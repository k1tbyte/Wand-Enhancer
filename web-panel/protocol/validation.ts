import { PROTOCOL_VERSION } from './contract';
import type { IncomingMessage, OutgoingMessage } from './messages';

const INCOMING_TYPES = new Set<IncomingMessage['type']>([
  'hello_ack',
  'trainer_meta',
  'trainer_values',
  'game_status',
  'installed_apps',
  'value_changed',
  'trainer_changed',
  'set_value_result',
  'remote_command_result',
  'error',
]);

const OUTGOING_TYPES = new Set<OutgoingMessage['type']>(['hello', 'set_value', 'remote_command']);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isIncomingMessage(value: unknown): value is IncomingMessage {
  if (!isEnvelope(value) || !INCOMING_TYPES.has(value.type as IncomingMessage['type'])) {
    return false;
  }

  const payload = value.payload;
  switch (value.type) {
    case 'hello_ack':
      return hasString(payload, 'sessionId') && hasBoolean(payload, 'accepted') && hasString(payload, 'serverVersion')
        && hasNumber(payload, 'protocolVersion');
    case 'trainer_meta':
      return isRecord(payload.session) && hasString(payload.session, 'instanceId')
        && isRecord(payload.trainer) && hasString(payload.trainer, 'trainerId')
        && isRecord(payload.schema) && Array.isArray(payload.schema.categories) && Array.isArray(payload.schema.cheats);
    case 'trainer_values':
      return hasString(payload, 'trainerId') && isRecord(payload.values);
    case 'installed_apps':
      return hasString(payload, 'instanceId') && hasString(payload, 'updatedAt') && Array.isArray(payload.apps);
    case 'game_status':
      return hasString(payload, 'instanceId') && hasString(payload, 'updatedAt')
        && isRecord(payload.session) && isRecord(payload.trainer);
    case 'value_changed':
      return hasString(payload, 'trainerId') && hasString(payload, 'target') && 'value' in payload;
    case 'trainer_changed':
      return hasString(payload, 'trainerId');
    case 'set_value_result':
      return hasBoolean(payload, 'ok') && hasString(payload, 'trainerId') && hasString(payload, 'target');
    case 'remote_command_result':
      return hasBoolean(payload, 'ok') && (payload.action === 'launch' || payload.action === 'stop');
    case 'error':
      return hasString(payload, 'code') && hasString(payload, 'message');
    default:
      return false;
  }
}

export function isOutgoingMessage(value: unknown): value is OutgoingMessage {
  if (!isEnvelope(value) || !OUTGOING_TYPES.has(value.type as OutgoingMessage['type'])) {
    return false;
  }

  const payload = value.payload;
  if (value.type === 'hello') {
    return payload.client === 'mobile-web' && hasString(payload, 'clientVersion') && isRecord(payload.capabilities);
  }
  if (value.type === 'set_value') {
    return hasString(payload, 'trainerId') && hasString(payload, 'target') && 'value' in payload;
  }
  return (payload.action === 'launch' || payload.action === 'stop');
}

function isEnvelope(value: unknown): value is Record<string, unknown> & {
  type: string;
  version: number;
  requestId: string | null;
  payload: Record<string, unknown>;
} {
  return isRecord(value)
    && typeof value.type === 'string'
    && value.version === PROTOCOL_VERSION
    && (value.requestId === null || typeof value.requestId === 'string')
    && isRecord(value.payload);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function hasNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'number';
}

function hasBoolean(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'boolean';
}
