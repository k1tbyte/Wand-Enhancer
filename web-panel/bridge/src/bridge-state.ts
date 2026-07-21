const {
    gameStatusSignature,
    installedAppsSignature,
    normalizeGameStatusSnapshot,
    normalizeInstalledAppsSnapshot,
    normalizeSnapshot,
    normalizeTrainerValue,
    summarizeInstalledAppsSource,
} = require('./normalizers');
const { cloneValue, isRecord, safeString } = require('./utils');
const { sendJson } = require('./websocket-codec');

function createBridgeState({ clients, log, getServerInfo }) {
    let currentSnapshot: any = null;
    let currentInstalledApps: any = null;
    let currentInstalledAppsSignature: string | null = null;
    let currentGameStatus: any = null;
    let currentGameStatusSignature: string | null = null;

    function broadcast(type, payload, requestId = null) {
        for (const client of clients) {
            if (client.handshaken) {
                sendJson(client, type, payload, requestId);
            }
        }
    }

    function sendSnapshot(client) {
        if (!currentSnapshot) {
            sendJson(client, 'trainer_changed', { previousTrainerId: null, trainerId: '' });
        } else {
            sendJson(client, 'trainer_meta', currentSnapshot.trainerMeta);
            sendJson(client, 'trainer_values', currentSnapshot.trainerValues);
        }
        if (currentGameStatus) sendJson(client, 'game_status', currentGameStatus);
        if (currentInstalledApps) sendJson(client, 'installed_apps', currentInstalledApps);
    }

    function sync(rawSnapshot) {
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

    function syncTrainerMeta(rawSnapshot) {
        const localizedSnapshot = normalizeSnapshot(rawSnapshot);
        const activeTrainerId = currentSnapshot?.trainerMeta?.trainer?.trainerId;
        if (!localizedSnapshot || localizedSnapshot.trainerMeta.trainer.trainerId !== activeTrainerId) {
            return;
        }

        currentSnapshot.trainerMeta = localizedSnapshot.trainerMeta;
        broadcast('trainer_meta', currentSnapshot.trainerMeta);
    }

    function valueChanged(change) {
        if (!currentSnapshot || !isRecord(change)) return;
        const target = safeString(change.target);
        if (!target) return;

        const value = normalizeTrainerValue(currentSnapshot, target, change.value);
        currentSnapshot.trainerValues.values[target] = value;
        broadcast('value_changed', {
            trainerId: safeString(change.trainerId, currentSnapshot.trainerMeta.trainer.trainerId),
            target,
            value,
            oldValue: cloneValue(change.oldValue),
            source: safeString(change.source, 'desktop'),
            cheatId: typeof change.cheatId === 'string' ? change.cheatId : undefined,
        });
    }

    function syncInstalledApps(rawInstalledApps) {
        const sourceSummary = summarizeInstalledAppsSource(rawInstalledApps);
        const nextInstalledApps = normalizeInstalledAppsSnapshot(rawInstalledApps);
        if (!nextInstalledApps) {
            log('warn', `Ignored invalid installed apps snapshot.${sourceSummary ? ` ${sourceSummary}` : ''}`);
            return;
        }
        const nextSignature = installedAppsSignature(nextInstalledApps);
        if (nextSignature === currentInstalledAppsSignature) return;
        currentInstalledApps = nextInstalledApps;
        currentInstalledAppsSignature = nextSignature;
        log('info', `Installed apps snapshot accepted (${currentInstalledApps.apps.length} app(s)).${sourceSummary ? ` ${sourceSummary}` : ''}`);
        broadcast('installed_apps', currentInstalledApps);
    }

    function syncGameStatus(rawGameStatus) {
        const nextGameStatus = normalizeGameStatusSnapshot(rawGameStatus);
        if (!nextGameStatus) {
            log('warn', 'Ignored invalid game status snapshot.');
            return;
        }
        const nextSignature = gameStatusSignature(nextGameStatus);
        if (nextSignature === currentGameStatusSignature) return;
        currentGameStatus = nextGameStatus;
        currentGameStatusSignature = nextSignature;
        log('info', `Game status snapshot accepted (${currentGameStatus.session.state}/${currentGameStatus.session.event}).`);
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
        get snapshot() { return currentSnapshot; },
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
