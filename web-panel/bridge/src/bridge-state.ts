import type {
    GameStatusPayload,
    IncomingMessage,
    InstalledAppsPayload,
    TrainerMetaPayload,
    TrainerValuesPayload,
} from '../../protocol/messages';
import type { BridgeClient, LogFn, ServerInfo } from './types';

const {
    gameStatusSignature,
    installedAppsSignature,
    normalizeGameStatusSnapshot,
    normalizeInstalledAppsSnapshot,
    normalizeSnapshot,
    normalizeTrainerValue,
    summarizeInstalledAppsSource,
} = require('./normalizers') as {
    gameStatusSignature: (snapshot: GameStatusPayload) => string;
    installedAppsSignature: (snapshot: InstalledAppsPayload) => string;
    normalizeGameStatusSnapshot: (snapshot: unknown) => GameStatusPayload | null;
    normalizeInstalledAppsSnapshot: (snapshot: unknown) => InstalledAppsPayload | null;
    normalizeSnapshot: (snapshot: unknown) => BridgeStateSnapshot | null;
    normalizeTrainerValue: (
        snapshot: BridgeStateSnapshot,
        target: string,
        value: unknown,
    ) => unknown;
    summarizeInstalledAppsSource: (snapshot: unknown) => string;
};
const { cloneValue, isRecord, safeString } = require('./utils') as {
    cloneValue: (value: unknown) => unknown;
    isRecord: (value: unknown) => value is Record<string, unknown>;
    safeString: (value: unknown, fallback?: string) => string;
};
const { sendJson } = require('./websocket-codec') as {
    sendJson: (
        client: BridgeClient,
        type: string,
        payload: unknown,
        requestId?: string | number | null,
    ) => void;
};

type BridgeStateSnapshot = { trainerMeta: TrainerMetaPayload; trainerValues: TrainerValuesPayload };

type BridgeStateOptions = {
    clients: Iterable<BridgeClient>;
    log: LogFn;
    getServerInfo: () => ServerInfo & { listening: boolean; remoteUrl: string | null };
};

function createBridgeState({ clients, log, getServerInfo }: BridgeStateOptions) {
    let currentSnapshot: BridgeStateSnapshot | null = null;
    let currentInstalledApps: InstalledAppsPayload | null = null;
    let currentInstalledAppsSignature: string | null = null;
    let currentGameStatus: GameStatusPayload | null = null;
    let currentGameStatusSignature: string | null = null;

    function broadcast(
        type: IncomingMessage['type'],
        payload: unknown,
        requestId: string | null = null,
    ) {
        for (const client of clients) {
            if (client.handshaken) {
                sendJson(client, type, payload, requestId);
            }
        }
    }

    function sendSnapshot(client: BridgeClient) {
        if (!currentSnapshot) {
            sendJson(client, 'trainer_changed', { previousTrainerId: null, trainerId: '' });
        } else {
            sendJson(client, 'trainer_meta', currentSnapshot.trainerMeta);
            sendJson(client, 'trainer_values', currentSnapshot.trainerValues);
        }
        if (currentGameStatus) sendJson(client, 'game_status', currentGameStatus);
        if (currentInstalledApps) sendJson(client, 'installed_apps', currentInstalledApps);
    }

    function sync(rawSnapshot: unknown) {
        const nextSnapshot = rawSnapshot ? normalizeSnapshot(rawSnapshot) : null;
        const previousTrainerId = currentSnapshot?.trainerMeta?.trainer?.trainerId ?? null;
        const nextTrainerId = nextSnapshot?.trainerMeta?.trainer?.trainerId ?? null;
        currentSnapshot = nextSnapshot;

        if (previousTrainerId !== nextTrainerId) {
            broadcast('trainer_changed', { previousTrainerId, trainerId: nextTrainerId || '' });
        }
        if (currentSnapshot) {
            broadcast('trainer_meta', currentSnapshot.trainerMeta);
            broadcast('trainer_values', currentSnapshot.trainerValues);
        }
    }

    function syncTrainerMeta(rawSnapshot: unknown) {
        const localizedSnapshot = normalizeSnapshot(rawSnapshot);
        if (
            !currentSnapshot ||
            !localizedSnapshot ||
            localizedSnapshot.trainerMeta.trainer.trainerId !==
                currentSnapshot.trainerMeta.trainer.trainerId
        ) {
            return;
        }

        currentSnapshot.trainerMeta = localizedSnapshot.trainerMeta;
        broadcast('trainer_meta', currentSnapshot.trainerMeta);
    }

    function valueChanged(change: unknown) {
        const snapshot = currentSnapshot;
        if (!snapshot || !isRecord(change)) return;
        const target = safeString(change.target);
        if (!target) return;

        if (safeString(change.trainerId) !== snapshot.trainerMeta.trainer.trainerId) return;

        const value = normalizeTrainerValue(snapshot, target, change.value);
        snapshot.trainerValues.values[target] = value;
        broadcast('value_changed', {
            trainerId: snapshot.trainerMeta.trainer.trainerId,
            target,
            value,
            oldValue: cloneValue(change.oldValue),
            source: safeString(change.source, 'desktop'),
            cheatId: typeof change.cheatId === 'string' ? change.cheatId : undefined,
        });
    }

    function syncInstalledApps(rawInstalledApps: unknown) {
        const sourceSummary = summarizeInstalledAppsSource(rawInstalledApps);
        const nextInstalledApps = normalizeInstalledAppsSnapshot(rawInstalledApps);
        if (!nextInstalledApps) {
            log(
                'warn',
                `Ignored invalid installed apps snapshot.${sourceSummary ? ` ${sourceSummary}` : ''}`,
            );
            return;
        }
        const nextSignature = installedAppsSignature(nextInstalledApps);
        if (nextSignature === currentInstalledAppsSignature) return;
        currentInstalledApps = nextInstalledApps;
        currentInstalledAppsSignature = nextSignature;
        log(
            'info',
            `Installed apps snapshot accepted (${nextInstalledApps.apps.length} app(s)).${sourceSummary ? ` ${sourceSummary}` : ''}`,
        );
        broadcast('installed_apps', currentInstalledApps);
    }

    function syncGameStatus(rawGameStatus: unknown) {
        const nextGameStatus = normalizeGameStatusSnapshot(rawGameStatus);
        if (!nextGameStatus) {
            log('warn', 'Ignored invalid game status snapshot.');
            return;
        }
        const nextSignature = gameStatusSignature(nextGameStatus);
        if (nextSignature === currentGameStatusSignature) return;
        currentGameStatus = nextGameStatus;
        currentGameStatusSignature = nextSignature;
        log(
            'info',
            `Game status snapshot accepted (${nextGameStatus.session.state}/${nextGameStatus.session.event}).`,
        );
        broadcast('game_status', currentGameStatus);
    }

    function buildHealthPayload() {
        const serverInfo = getServerInfo();
        return {
            ok: serverInfo.listening,
            trainerId: currentSnapshot?.trainerMeta?.trainer?.trainerId || null,
            gameSessionState: currentGameStatus?.session?.state || 'idle',
            gameSessionEvent: currentGameStatus?.session?.event || 'snapshot',
            runningTrainerId: currentGameStatus?.trainer?.trainerId || null,
            installedAppsCount: currentInstalledApps?.apps?.length ?? 0,
            remoteUrl: serverInfo.remoteUrl,
            advertisedUrls: serverInfo.advertisedUrls,
        };
    }

    function clear() {
        currentSnapshot = null;
        currentInstalledApps = null;
        currentInstalledAppsSignature = null;
        currentGameStatus = null;
        currentGameStatusSignature = null;
    }

    return {
        get snapshot() {
            return currentSnapshot;
        },
        buildHealthPayload,
        clear,
        sendSnapshot,
        sync,
        syncTrainerMeta,
        syncGameStatus,
        syncInstalledApps,
        valueChanged,
    };
}

module.exports = {
    createBridgeState,
};
