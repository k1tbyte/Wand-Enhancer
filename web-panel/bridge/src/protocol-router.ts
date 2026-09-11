import type {
    CheatSchema,
    SetValueMessage,
    TrainerMetaPayload,
    TrainerValuesPayload,
} from '../../protocol/messages';
import { isOutgoingMessage } from '../../protocol/validation';
import webContract from '../../protocol/web-contract.json';
import { isRecord, safeString } from './utils';

const BRIDGE_PROTOCOL_VERSION = webContract.protocolVersion;

export function validateClientMessage(message: unknown, handshaken: boolean) {
    if (!isRecord(message) || typeof message.type !== 'string' || !isRecord(message.payload)) {
        return invalid('invalid_message', 'Expected a protocol envelope with an object payload.');
    }

    if (message.version !== BRIDGE_PROTOCOL_VERSION) {
        return invalid(
            'protocol_mismatch',
            `Unsupported protocol version ${String(message.version)}.`,
        );
    }

    if (message.requestId !== null && typeof message.requestId !== 'string') {
        return invalid('invalid_request_id', 'requestId must be a string or null.');
    }

    if (!isOutgoingMessage(message)) {
        const type = (message as Record<string, unknown>).type;
        if (type === 'hello') {
            return invalid('invalid_hello', 'The hello payload is incomplete.');
        }
        if (type === 'set_value') {
            return invalid('invalid_set_value', 'trainerId, target and value are required.');
        }
        if (type === 'remote_command') {
            return invalid('invalid_command', 'Unknown remote command.');
        }
        return invalid('unknown_message', 'Unknown protocol message type.');
    }

    if (message.type !== 'hello' && !handshaken) {
        return invalid('handshake_required', 'Send a compatible hello message before commands.');
    }

    return { ok: true };
}

/** Only the parts this validator actually reads, so callers need not build a full payload. */
type ValidationSnapshot = {
    trainerMeta: {
        trainer: Pick<TrainerMetaPayload['trainer'], 'trainerId'>;
        schema: { cheats: Pick<CheatSchema, 'target' | 'type'>[] };
    };
    trainerValues: Pick<TrainerValuesPayload, 'values'>;
};

export function validateSetValueTarget(
    message: Pick<SetValueMessage, 'payload'>,
    snapshot: ValidationSnapshot | null,
) {
    const target = safeString(message.payload?.target);
    const requestedTrainerId = safeString(message.payload?.trainerId);
    const activeTrainerId = snapshot?.trainerMeta?.trainer?.trainerId || '';
    if (!snapshot || requestedTrainerId !== activeTrainerId) {
        return invalid('trainer_mismatch', 'The requested trainer is not active.');
    }

    const cheat = snapshot.trainerMeta.schema.cheats.find((entry) => entry.target === target);
    if (!target || !cheat || !(target in snapshot.trainerValues.values)) {
        return invalid('invalid_target', 'Unknown cheat target.');
    }

    return {
        ok: true,
        trainerId: activeTrainerId,
        target,
        cheat,
        value: cheat.type === 'toggle' ? Boolean(message.payload.value) : message.payload.value,
    };
}

function invalid(code: string, message: string) {
    return { ok: false, error: { code, message } };
}
