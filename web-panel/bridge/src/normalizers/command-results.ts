import type { RemoteCommandAction, RemoteCommandResultPayload } from '../../../protocol/messages';
import type { UnknownRecord } from '../types';

const { isRecord, safeString, toStringId } = require('../utils');

function normalizeRemoteCommandAction(value: unknown): RemoteCommandAction | null {
    return value === 'launch' || value === 'stop' ? (value as RemoteCommandAction) : null;
}

function normalizeRemoteCommandResult(
    rawResult: unknown,
    fallback: { action: RemoteCommandAction; gameId?: string | null; titleId?: string | null },
): RemoteCommandResultPayload {
    const raw = isRecord(rawResult) ? (rawResult as UnknownRecord) : null;
    const action = normalizeRemoteCommandAction(raw ? raw.action : null) || fallback.action;
    const gameId = raw
        ? toStringId(raw.gameId) || fallback.gameId || null
        : fallback.gameId || null;
    const titleId = raw
        ? toStringId(raw.titleId) || fallback.titleId || null
        : fallback.titleId || null;
    const ok = rawResult === true || Boolean(raw && raw.ok === true);
    const payload = { ok, action, gameId, titleId };
    if (ok) return payload;

    const errorRaw = raw && isRecord(raw.error) ? (raw.error as UnknownRecord) : null;
    if (!errorRaw) {
        return {
            ...payload,
            error: {
                code: 'command_rejected',
                message: 'The renderer rejected the remote command.',
            },
        };
    }
    return {
        ...payload,
        error: {
            code: safeString(errorRaw.code, 'command_rejected'),
            message: safeString(errorRaw.message, 'The renderer rejected the remote command.'),
        },
    };
}

module.exports = {
    normalizeRemoteCommandAction,
    normalizeRemoteCommandResult,
};
