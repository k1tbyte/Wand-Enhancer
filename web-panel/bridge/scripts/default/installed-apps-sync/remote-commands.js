import {
    COMMAND_RESPONSE_CHANNEL,
    REMOTE_COMMAND_LAUNCH,
    REMOTE_COMMAND_STOP,
    REMOTE_COMMAND_TRIGGER,
    REMOTE_STOP_EVENT,
} from './constants.js';
import { clearTrainerSnapshot, syncGameStatus } from './game-status.js';
import {
    getInstalledVersionsForGame,
    rankInstalledAppCandidates,
    resolveInstalledData,
} from './installed-data.js';
import {
    formatError,
    getPreferredLocale,
    invokeIpc,
    isRecord,
    safeString,
    toStringId,
} from './runtime.js';

export function handleRemoteCommandRequest(state, _event, request) {
    void (async () => {
        let response;

        if (request?.action === REMOTE_COMMAND_LAUNCH) {
            response = await executeRemoteLaunchCommand(state, request);
        } else if (request?.action === REMOTE_COMMAND_STOP) {
            response = await executeRemoteStopCommand(state, request);
        } else {
            response = buildCommandResponse(request, false, {
                code: 'invalid_command',
                message: 'Unknown remote command.',
            });
        }

        await sendRemoteCommandResponse(state, response);
    })();
}

function buildCommandResponse(request, ok, error = null) {
    const response = {
        requestId: safeString(request?.requestId),
        ok,
        action:
            request?.action === REMOTE_COMMAND_STOP ? REMOTE_COMMAND_STOP : REMOTE_COMMAND_LAUNCH,
        gameId: toStringId(request?.gameId),
        titleId: toStringId(request?.titleId),
    };

    if (!error) {
        return response;
    }

    return {
        ...response,
        error,
    };
}

async function executeRemoteLaunchCommand(state, request) {
    const gameId = toStringId(request?.gameId);
    if (!gameId) {
        return buildCommandResponse(request, false, {
            code: 'invalid_game',
            message: 'A game id is required to launch a trainer.',
        });
    }

    if (!state.resolveRemoteCommandServices()) {
        return buildCommandResponse(request, false, {
            code: 'bridge_not_ready',
            message: 'The Wand renderer container is not ready yet.',
        });
    }

    if (!state.trainerService) {
        return buildCommandResponse(request, false, {
            code: 'trainer_service_missing',
            message: 'The Wand trainer service is not available yet.',
        });
    }

    if (!state.trainerLaunchRequestCtor) {
        return buildCommandResponse(request, false, {
            code: 'trainer_launch_missing',
            message: 'The Wand trainer launch request constructor is not available yet.',
        });
    }

    const data = resolveInstalledData(state);
    if (!data) {
        return buildCommandResponse(request, false, {
            code: 'installations_missing',
            message: 'Installed game data is not available yet.',
        });
    }

    const launchInfo = getLaunchInfoForGame(gameId, data);
    if (!isRecord(launchInfo.app)) {
        return buildCommandResponse(request, false, {
            code: 'game_not_installed',
            message: 'Wand could not resolve a preferred installation for this game.',
        });
    }

    const trainerInfo = await resolveTrainerInfoForGame(state, gameId, data);
    if (!trainerInfo) {
        return buildCommandResponse(request, false, {
            code: 'trainer_not_found',
            message: 'Wand could not find a compatible trainer for this game.',
        });
    }

    try {
        const launchRequest = new state.trainerLaunchRequestCtor(
            trainerInfo,
            launchInfo.app,
            launchInfo.version,
            REMOTE_COMMAND_TRIGGER,
        );
        await state.trainerService.launch(launchRequest);
        state.queueSync(true);
        state.queueFollowUpSync();
        void syncGameStatus(state, true);
        return buildCommandResponse(request, true);
    } catch (error) {
        state.log('warn', 'Remote trainer launch failed.', formatError(error));
        return buildCommandResponse(request, false, {
            code: 'launch_failed',
            message: 'Failed to launch the trainer.',
        });
    }
}

async function executeRemoteStopCommand(state, request) {
    if (!state.resolveRemoteCommandServices()) {
        return buildCommandResponse(request, false, {
            code: 'bridge_not_ready',
            message: 'The Wand renderer container is not ready yet.',
        });
    }

    if (!state.trainerService || typeof state.trainerService.endTrainer !== 'function') {
        return buildCommandResponse(request, false, {
            code: 'trainer_service_missing',
            message: 'The Wand trainer service is not available yet.',
        });
    }

    if (!state.trainerService.trainer && state.currentRunningTrainer.state !== 'running') {
        return buildCommandResponse(request, false, {
            code: 'no_active_trainer',
            message: 'No trainer is running right now.',
        });
    }

    try {
        await state.trainerService.endTrainer();
        clearTrainerSnapshot(state, REMOTE_STOP_EVENT, true);
        return buildCommandResponse(request, true);
    } catch (error) {
        state.log('warn', 'Remote trainer stop failed.', formatError(error));
        return buildCommandResponse(request, false, {
            code: 'stop_failed',
            message: 'Failed to stop the running trainer.',
        });
    }
}

function getLaunchInfoForGame(gameId, data) {
    const versions = Array.isArray(data?.installedGameVersions?.[gameId])
        ? data.installedGameVersions[gameId]
        : [];
    const game = isRecord(data?.catalog?.games?.[gameId]) ? data.catalog.games[gameId] : null;

    const top = rankInstalledAppCandidates(data?.rawInstalledApps ?? {}, game, versions)[0];

    return top ? { app: top.app, version: top.version } : { app: null, version: null };
}

async function resolveTrainerInfoForGame(state, gameId, data) {
    if (!state.trainerApiService) {
        return null;
    }

    try {
        const localTrainer = unwrapTrainerInfo(
            await state.trainerApiService.getLatestLocalTrainerForGame(gameId),
        );
        if (localTrainer) {
            return localTrainer;
        }
    } catch (error) {
        state.log('warn', 'Local trainer lookup failed.', formatError(error));
    }

    try {
        return unwrapTrainerInfo(
            await state.trainerApiService.getMostCompatibleTrainerForGame(
                gameId,
                getPreferredLocale(),
                getInstalledVersionsForGame(gameId, data),
                false,
            ),
        );
    } catch (error) {
        state.log('warn', 'Compatible trainer lookup failed.', formatError(error));
        return null;
    }
}

function unwrapTrainerInfo(value) {
    if (isRecord(value?.trainer)) {
        return value.trainer;
    }

    return isRecord(value) ? value : null;
}

async function sendRemoteCommandResponse(state, response) {
    await invokeIpc(state, COMMAND_RESPONSE_CHANNEL, response, 'Remote command response');
}
