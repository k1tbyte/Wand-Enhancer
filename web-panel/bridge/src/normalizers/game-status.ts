import type { GameStatusPayload } from '../../../protocol/messages';
import type { UnknownRecord } from '../types';

const { isRecord, safeString, toStringId } = require('../utils');

function normalizeGameStatusSnapshot(rawSnapshot: unknown): GameStatusPayload | null {
    if (!isRecord(rawSnapshot)) return null;
    const snap = rawSnapshot as UnknownRecord;
    const rawSession = isRecord(snap.session) ? (snap.session as UnknownRecord) : {};
    const rawTrainer = isRecord(snap.trainer) ? (snap.trainer as UnknownRecord) : {};
    return {
        instanceId: safeString(snap.instanceId, 'wand-game-status'),
        updatedAt: typeof snap.updatedAt === 'string' ? snap.updatedAt : new Date().toISOString(),
        session: {
            state: rawSession.state === 'running' ? 'running' : 'idle',
            event: safeString(rawSession.event, 'snapshot'),
            processId: typeof rawSession.processId === 'number' ? rawSession.processId : null,
            gameId: toStringId(rawSession.gameId),
            titleId: toStringId(rawSession.titleId),
            titleName: typeof rawSession.titleName === 'string' ? rawSession.titleName : null,
            sessionDurationSeconds:
                typeof rawSession.sessionDurationSeconds === 'number'
                    ? rawSession.sessionDurationSeconds
                    : null,
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

function gameStatusSignature(snapshot: GameStatusPayload): string {
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
