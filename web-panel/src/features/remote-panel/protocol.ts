export const PROTOCOL_VERSION = 1;

export type CheatType =
  | 'slider'
  | 'number'
  | 'toggle'
  | 'button'
  | 'selection'
  | 'scalar'
  | 'incremental';

export interface CheatOption {
  label?: string;
  value: string | number;
}

export type CheatOptionLike = CheatOption | string | number;

export interface CheatArgs {
  min?: number;
  max?: number;
  step?: number;
  options?: CheatOptionLike[];
  button?: string | boolean;
  postfix?: string;
  default?: string | number | boolean;
}

export interface CheatSchema {
  uuid: string;
  target: string;
  type: CheatType;
  name: string;
  description?: string | null;
  instructions?: string | null;
  category: string;
  parent?: string | null;
  flags?: number;
  hotkeys?: string[][];
  args: CheatArgs;
}

export interface TrainerSummary {
  trainerId: string;
  gameId: string;
  displayName?: string | null;
  titleId?: string | null;
  gameVersion?: string | null;
  trainerLoading: boolean;
  gameInstalled: boolean;
  needsCompatibilityWarning: boolean;
  language?: string;
  themeId?: string;
  isTimeLimitExpired: boolean;
  notesReadHash?: string | null;
}

export interface TrainerMetaPayload {
  session: {
    instanceId: string;
  };
  trainer: TrainerSummary;
  schema: {
    categories: string[];
    cheats: CheatSchema[];
  };
}

export type TrainerValuesPayload = {
  trainerId: string;
  values: Record<string, unknown>;
};

export type ValueChangedPayload = {
  trainerId: string;
  target: string;
  value: unknown;
  oldValue?: unknown;
  source?: string;
  cheatId?: string;
};

export type TrainerChangedPayload = {
  previousTrainerId?: string | null;
  trainerId: string;
};

export type SetValuePayload = {
  trainerId: string;
  target: string;
  value: unknown;
  cheatId?: string;
};

export type SetValueResultPayload = {
  ok: boolean;
  trainerId: string;
  target: string;
  error?: {
    code: string;
    message: string;
  };
};

export type ErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export interface MessageEnvelope<TType extends string, TPayload> {
  type: TType;
  version: number;
  requestId: string | null;
  payload: TPayload;
}

export type HelloMessage = MessageEnvelope<
  'hello',
  {
    client: 'mobile-web';
    clientVersion: string;
    pairingToken?: string;
    capabilities: {
      supportsDeltaValues: boolean;
      supportsTrainerSwitch: boolean;
    };
  }
>;

export type HelloAckMessage = MessageEnvelope<
  'hello_ack',
  {
    sessionId: string;
    accepted: boolean;
    serverVersion: string;
    protocolVersion: number;
    remoteUrl?: string;
    advertisedUrls?: string[];
  }
>;

export type TrainerMetaMessage = MessageEnvelope<'trainer_meta', TrainerMetaPayload>;
export type TrainerValuesMessage = MessageEnvelope<'trainer_values', TrainerValuesPayload>;
export type ValueChangedMessage = MessageEnvelope<'value_changed', ValueChangedPayload>;
export type TrainerChangedMessage = MessageEnvelope<'trainer_changed', TrainerChangedPayload>;
export type SetValueMessage = MessageEnvelope<'set_value', SetValuePayload>;
export type SetValueResultMessage = MessageEnvelope<'set_value_result', SetValueResultPayload>;
export type ErrorMessage = MessageEnvelope<'error', ErrorPayload>;

export type IncomingMessage =
  | HelloAckMessage
  | TrainerMetaMessage
  | TrainerValuesMessage
  | ValueChangedMessage
  | TrainerChangedMessage
  | SetValueResultMessage
  | ErrorMessage;

export type OutgoingMessage = HelloMessage | SetValueMessage;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isIncomingMessage(value: unknown): value is IncomingMessage {
  return isRecord(value) && typeof value.type === 'string' && typeof value.version === 'number' && 'payload' in value;
}

export function resolveOption(option: CheatOptionLike): CheatOption {
  if (typeof option === 'string' || typeof option === 'number') {
    return { label: String(option), value: option };
  }

  return {
    label: option.label ?? String(option.value),
    value: option.value,
  };
}

export function normalizeIncomingValue(cheat: CheatSchema, value: unknown): unknown {
  if (cheat.type === 'toggle') {
    return Boolean(value);
  }

  return value;
}

export function normalizeOutgoingValue(cheat: CheatSchema, value: unknown): unknown {
  if (cheat.type === 'toggle') {
    return Boolean(value);
  }

  if (cheat.type !== 'slider' && cheat.type !== 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return value;
  }

  return Number(trimmedValue);
}
