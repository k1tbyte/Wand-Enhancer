import webContract from '../../protocol/web-contract.json';

const BRIDGE_PROTOCOL_VERSION = webContract.protocolVersion;

export function validateClientMessage(message, handshaken) {
    if (!isRecord(message) || typeof message.type !== 'string' || !isRecord(message.payload)) {
        return invalid('invalid_message', 'Expected a protocol envelope with an object payload.');
    }

    if (message.version !== BRIDGE_PROTOCOL_VERSION) {
        return invalid('protocol_mismatch', `Unsupported protocol version ${String(message.version)}.`);
    }

    if (message.requestId !== null && typeof message.requestId !== 'string') {
        return invalid('invalid_request_id', 'requestId must be a string or null.');
    }

    if (message.type === 'hello') {
        if (message.payload.client !== 'mobile-web' || typeof message.payload.clientVersion !== 'string' || !isRecord(message.payload.capabilities)) {
            return invalid('invalid_hello', 'The hello payload is incomplete.');
        }
        return { ok: true };
    }

    if (!handshaken) {
        return invalid('handshake_required', 'Send a compatible hello message before commands.');
    }

    if (message.type === 'set_value') {
        if (!safeString(message.payload.trainerId) || !safeString(message.payload.target) || !('value' in message.payload)) {
            return invalid('invalid_set_value', 'trainerId, target and value are required.');
        }
        return { ok: true };
    }

    if (message.type === 'remote_command') {
        if (message.payload.action !== 'launch' && message.payload.action !== 'stop') {
            return invalid('invalid_command', 'Unknown remote command.');
        }
        return { ok: true };
    }

    return invalid('unknown_message', 'Unknown protocol message type.');
}

export function validateSetValueTarget(message, snapshot) {
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

function invalid(code, message) {
    return { ok: false, error: { code, message } };
}

function isRecord(value) {
    return typeof value === 'object' && value !== null;
}

function safeString(value) {
    return typeof value === 'string' && value.length > 0 ? value : '';
}
