const { isRecord, safeString, toStringId } = require('../utils');

function normalizeGameStatusSnapshot(rawSnapshot) {
    if (!isRecord(rawSnapshot)) return null;
    const rawSession = isRecord(rawSnapshot.session) ? rawSnapshot.session : {};
    const rawTrainer = isRecord(rawSnapshot.trainer) ? rawSnapshot.trainer : {};
    return {
        instanceId: safeString(rawSnapshot.instanceId, 'wand-game-status'),
        updatedAt: typeof rawSnapshot.updatedAt === 'string' ? rawSnapshot.updatedAt : new Date().toISOString(),
        session: {
            state: rawSession.state === 'running' ? 'running' : 'idle',
            event: safeString(rawSession.event, 'snapshot'),
            processId: typeof rawSession.processId === 'number' ? rawSession.processId : null,
            gameId: toStringId(rawSession.gameId),
            titleId: toStringId(rawSession.titleId),
            titleName: typeof rawSession.titleName === 'string' ? rawSession.titleName : null,
            sessionDurationSeconds: typeof rawSession.sessionDurationSeconds === 'number' ? rawSession.sessionDurationSeconds : null,
            startedAt: typeof rawSession.startedAt === 'string' ? rawSession.startedAt : null,
            endedAt: typeof rawSession.endedAt === 'string' ? rawSession.endedAt : null,
        },
        trainer: {
            state: rawTrainer.state === 'running' ? 'running' : 'idle',
            event: safeString(rawTrainer.event, 'snapshot'),
            trainerId: toStringId(rawTrainer.trainerId),
            displayName: typeof rawTrainer.displayName === 'string' ? rawTrainer.displayName : null,
            gameId: toStringId(rawTrainer.gameId),
            titleId: toStringId(rawTrainer.titleId),
        },
    };
}

function gameStatusSignature(snapshot) {
    return [
        snapshot.session.state,
        snapshot.session.event,
        snapshot.session.processId || '',
        snapshot.session.gameId || '',
        snapshot.session.titleId || '',
        snapshot.session.titleName || '',
        snapshot.session.sessionDurationSeconds || '',
        snapshot.session.startedAt || '',
        snapshot.session.endedAt || '',
        snapshot.trainer.state,
        snapshot.trainer.event,
        snapshot.trainer.trainerId || '',
        snapshot.trainer.displayName || '',
        snapshot.trainer.gameId || '',
        snapshot.trainer.titleId || '',
    ].join('|');
}

module.exports = {
    gameStatusSignature,
    normalizeGameStatusSnapshot,
};
