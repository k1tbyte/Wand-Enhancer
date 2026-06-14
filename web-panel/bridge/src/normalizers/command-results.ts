const { isRecord, safeString, toStringId } = require('../utils');

function normalizeRemoteCommandAction(value) {
    return value === 'launch' || value === 'stop' ? value : null;
}

function normalizeRemoteCommandResult(rawResult, fallback) {
    const action = normalizeRemoteCommandAction(isRecord(rawResult) ? rawResult.action : null) || fallback.action;
    const gameId = isRecord(rawResult) ? toStringId(rawResult.gameId) || fallback.gameId || null : fallback.gameId || null;
    const titleId = isRecord(rawResult) ? toStringId(rawResult.titleId) || fallback.titleId || null : fallback.titleId || null;
    const ok = rawResult === true || Boolean(isRecord(rawResult) && rawResult.ok === true);
    const payload = { ok, action, gameId, titleId };
    if (ok) return payload;
    if (!isRecord(rawResult) || !isRecord(rawResult.error)) {
        return {
            ...payload,
            error: { code: 'command_rejected', message: 'The renderer rejected the remote command.' },
        };
    }
    return {
        ...payload,
        error: {
            code: safeString(rawResult.error.code, 'command_rejected'),
            message: safeString(rawResult.error.message, 'The renderer rejected the remote command.'),
        },
    };
}

module.exports = {
    normalizeRemoteCommandAction,
    normalizeRemoteCommandResult,
};
