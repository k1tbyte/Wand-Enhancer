import {
  COMMAND_RESPONSE_CHANNEL,
  REMOTE_COMMAND_LAUNCH,
  REMOTE_COMMAND_STOP,
  REMOTE_COMMAND_TRIGGER,
  REMOTE_STOP_EVENT,
} from "./constants.js"
import { clearTrainerSnapshot, syncGameStatus } from "./game-status.js"
import {
  compareInstalledAppRecords,
  getInstalledVersionsForGame,
  resolveInstalledData,
  toInstalledAppRecord,
} from "./installed-data.js"
import {
  getPreferredLocale,
  isRecord,
  safeString,
  toStringId,
} from "./runtime.js"

export function handleRemoteCommandRequest(state, _event, request) {
  void (async () => {
    let response

    if (request?.action === REMOTE_COMMAND_LAUNCH) {
      response = await executeRemoteLaunchCommand(state, request)
    } else if (request?.action === REMOTE_COMMAND_STOP) {
      response = await executeRemoteStopCommand(state, request)
    } else {
      response = buildCommandResponse(request, false, {
        code: "invalid_command",
        message: "Unknown remote command.",
      })
    }

    await sendRemoteCommandResponse(state, response)
  })()
}

function buildCommandResponse(request, ok, error = null) {
  const response = {
    requestId: safeString(request?.requestId),
    ok,
    action:
      request?.action === REMOTE_COMMAND_STOP
        ? REMOTE_COMMAND_STOP
        : REMOTE_COMMAND_LAUNCH,
    gameId: toStringId(request?.gameId),
    titleId: toStringId(request?.titleId),
  }

  if (!error) {
    return response
  }

  return {
    ...response,
    error,
  }
}

async function executeRemoteLaunchCommand(state, request) {
  const gameId = toStringId(request?.gameId)
  if (!gameId) {
    return buildCommandResponse(request, false, {
      code: "invalid_game",
      message: "A game id is required to launch a trainer.",
    })
  }

  if (!state.resolveRemoteCommandServices()) {
    return buildCommandResponse(request, false, {
      code: "bridge_not_ready",
      message: "The Wand renderer container is not ready yet.",
    })
  }

  if (!state.trainerService) {
    return buildCommandResponse(request, false, {
      code: "trainer_service_missing",
      message: "The Wand trainer service is not available yet.",
    })
  }

  if (!state.trainerLaunchRequestCtor) {
    return buildCommandResponse(request, false, {
      code: "trainer_launch_missing",
      message:
        "The Wand trainer launch request constructor is not available yet.",
    })
  }

  const data = resolveInstalledData(state)
  if (!data) {
    return buildCommandResponse(request, false, {
      code: "installations_missing",
      message: "Installed game data is not available yet.",
    })
  }

  const launchInfo = getLaunchInfoForGame(gameId, data)
  if (!isRecord(launchInfo.app)) {
    return buildCommandResponse(request, false, {
      code: "game_not_installed",
      message: "Wand could not resolve a preferred installation for this game.",
    })
  }

  const trainerInfo = await resolveTrainerInfoForGame(state, gameId, data)
  if (!trainerInfo) {
    return buildCommandResponse(request, false, {
      code: "trainer_not_found",
      message: "Wand could not find a compatible trainer for this game.",
    })
  }

  try {
    const launchRequest = new state.trainerLaunchRequestCtor(
      trainerInfo,
      launchInfo.app,
      launchInfo.version,
      REMOTE_COMMAND_TRIGGER
    )
    await state.trainerService.launch(launchRequest)
    state.queueSync(true)
    state.queueFollowUpSync()
    void syncGameStatus(state, true)
    return buildCommandResponse(request, true)
  } catch (error) {
    return buildCommandResponse(request, false, {
      code: "launch_failed",
      message:
        error instanceof Error
          ? error.message
          : "Failed to launch the trainer.",
    })
  }
}

async function executeRemoteStopCommand(state, request) {
  if (!state.resolveRemoteCommandServices()) {
    return buildCommandResponse(request, false, {
      code: "bridge_not_ready",
      message: "The Wand renderer container is not ready yet.",
    })
  }

  if (
    !state.trainerService ||
    typeof state.trainerService.endTrainer !== "function"
  ) {
    return buildCommandResponse(request, false, {
      code: "trainer_service_missing",
      message: "The Wand trainer service is not available yet.",
    })
  }

  if (
    !state.trainerService.trainer &&
    state.currentRunningTrainer.state !== "running"
  ) {
    return buildCommandResponse(request, false, {
      code: "no_active_trainer",
      message: "No trainer is running right now.",
    })
  }

  try {
    await state.trainerService.endTrainer()
    clearTrainerSnapshot(state, REMOTE_STOP_EVENT, true)
    return buildCommandResponse(request, true)
  } catch (error) {
    return buildCommandResponse(request, false, {
      code: "stop_failed",
      message:
        error instanceof Error
          ? error.message
          : "Failed to stop the running trainer.",
    })
  }
}

function getLaunchInfoForGame(gameId, data) {
  const versions = Array.isArray(data?.installedGameVersions?.[gameId])
    ? data.installedGameVersions[gameId]
    : []
  const game = isRecord(data?.catalog?.games?.[gameId])
    ? data.catalog.games[gameId]
    : null
  const candidates = []

  if (Array.isArray(game?.correlationIds)) {
    for (const correlationId of game.correlationIds) {
      if (typeof correlationId === "string" && correlationId.trim()) {
        candidates.push({ correlationId: correlationId.trim(), version: null })
      }
    }
  }

  for (const versionEntry of versions) {
    if (
      typeof versionEntry?.correlationId === "string" &&
      versionEntry.correlationId.trim()
    ) {
      candidates.push({
        correlationId: versionEntry.correlationId.trim(),
        version: versionEntry.version ?? null,
      })
    }
  }

  const rankedCandidates = Array.from(
    new Map(
      candidates.map((candidate) => [candidate.correlationId, candidate])
    ).values()
  )
    .map((candidate) => normalizeLaunchCandidate(candidate, data))
    .filter(Boolean)
    .sort((left, right) =>
      compareInstalledAppRecords(left.normalizedApp, right.normalizedApp)
    )

  if (!rankedCandidates[0]) {
    return { app: null, version: null }
  }

  return {
    app: rankedCandidates[0].app,
    version: rankedCandidates[0].version,
  }
}

async function resolveTrainerInfoForGame(state, gameId, data) {
  if (!state.trainerApiService) {
    return null
  }

  try {
    const localTrainer = unwrapTrainerInfo(
      await state.trainerApiService.getLatestLocalTrainerForGame(gameId)
    )
    if (localTrainer) {
      return localTrainer
    }
  } catch (error) {
    state.log(
      "warn",
      "Local trainer lookup failed.",
      error?.stack || String(error)
    )
  }

  try {
    return unwrapTrainerInfo(
      await state.trainerApiService.getMostCompatibleTrainerForGame(
        gameId,
        getPreferredLocale(),
        getInstalledVersionsForGame(gameId, data),
        false
      )
    )
  } catch (error) {
    state.log(
      "warn",
      "Compatible trainer lookup failed.",
      error?.stack || String(error)
    )
    return null
  }
}

function normalizeLaunchCandidate(candidate, data) {
  const app = data?.rawInstalledApps?.[candidate.correlationId]
  const normalizedApp = toInstalledAppRecord(candidate.correlationId, app)
  if (!normalizedApp || !isRecord(app)) {
    return null
  }

  return {
    app,
    version: candidate.version,
    normalizedApp,
  }
}

function unwrapTrainerInfo(value) {
  if (isRecord(value?.trainer)) {
    return value.trainer
  }

  return isRecord(value) ? value : null
}

async function sendRemoteCommandResponse(state, response) {
  if (!state.ipcRenderer) {
    return
  }

  try {
    await state.ipcRenderer.invoke(COMMAND_RESPONSE_CHANNEL, response)
  } catch (error) {
    state.log(
      "warn",
      "Remote command response IPC failed.",
      error?.stack || String(error)
    )
  }
}
