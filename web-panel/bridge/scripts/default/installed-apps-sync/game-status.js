import {
  GAME_ENDED_EVENT,
  GAME_LAUNCHED_EVENT,
  GAME_STATUS_CHANNEL,
  SYNTHETIC_SESSION_IDLE_EVENT,
  SYNTHETIC_SESSION_RUNNING_EVENT,
  TRAINER_ENDED_EVENT,
  TRAINER_SNAPSHOT_CHANNEL,
} from "./constants.js"
import { isRecord, safeString, toStringId } from "./runtime.js"

export function createIdleGameSession() {
  return {
    state: "idle",
    event: "snapshot",
    processId: null,
    gameId: null,
    titleId: null,
    titleName: null,
    sessionDurationSeconds: null,
    startedAt: null,
    endedAt: null,
  }
}

export function createIdleTrainerStatus() {
  return {
    state: "idle",
    event: "snapshot",
    trainerId: null,
    displayName: null,
    gameId: null,
    titleId: null,
  }
}

export function installGameStatusSubscriptions(state) {
  let installed = false

  if (
    state.gameLifecycleService &&
    !state.gameLifecycleSubscriptionsInstalled
  ) {
    installed = installLifecycleSubscriptions(state) || installed
  }

  if (
    state.trainerVisibilityService &&
    !state.trainerVisibilitySubscriptionInstalled
  ) {
    state.currentRunningTrainer = normalizeRunningTrainerStatus(
      state.trainerVisibilityService.runningTrainer,
      "snapshot"
    )
    syncGameSessionFromTrainerStatus(state, state.currentRunningTrainer)
    installed = installTrainerVisibilitySubscription(state) || installed
    state.trainerVisibilitySubscriptionInstalled = true
  }

  if (
    state.trainerService &&
    !state.trainerEndedSubscriptionInstalled &&
    typeof state.trainerService.onTrainerEnded === "function"
  ) {
    state.trainerService.onTrainerEnded(() => {
      clearTrainerSnapshot(state, TRAINER_ENDED_EVENT, true)
    })
    state.trainerEndedSubscriptionInstalled = true
    installed = true
  }

  if (!installed) {
    return
  }

  state.log(
    "info",
    "Game status hooks installed.",
    `lifecycle=${state.gameLifecycleSubscriptionsInstalled ? "yes" : "no"}, trainer=${state.trainerVisibilitySubscriptionInstalled ? "yes" : "no"}, trainerEnded=${state.trainerEndedSubscriptionInstalled ? "yes" : "no"}`
  )
  void syncGameStatus(state, true)
}

export function clearTrainerSnapshot(state, reason, clearSession = false) {
  state.currentRunningTrainer = {
    ...createIdleTrainerStatus(),
    event: reason,
  }

  if (clearSession) {
    clearGameSession(state, reason)
  } else if (
    state.currentGameSession.state === "running" &&
    isSyntheticGameSessionEvent(state.currentGameSession.event)
  ) {
    syncGameSessionFromTrainerStatus(state, state.currentRunningTrainer)
  }

  void syncGameStatus(state, true)
  if (!state.ipcRenderer) {
    return
  }

  try {
    void state.ipcRenderer.invoke(TRAINER_SNAPSHOT_CHANNEL, null)
  } catch (error) {
    state.log(
      "warn",
      "Trainer snapshot clear IPC failed.",
      error?.stack || String(error)
    )
  }
}

export async function syncGameStatus(state, force = false) {
  if (!state.ipcRenderer) {
    return false
  }

  const snapshot = buildGameStatusSnapshot(state)
  const signature = makeGameStatusSignature(snapshot)
  if (!force && signature === state.lastGameStatusSignature) {
    return false
  }

  state.lastGameStatusSignature = signature

  try {
    await state.ipcRenderer.invoke(GAME_STATUS_CHANNEL, snapshot)
    state.log(
      "info",
      "Game status snapshot sent.",
      `session=${snapshot.session.state}/${snapshot.session.event}, trainer=${snapshot.trainer.state}/${snapshot.trainer.event}`
    )
    return true
  } catch (error) {
    state.log(
      "error",
      "Game status snapshot IPC failed.",
      error?.stack || String(error)
    )
    return false
  }
}

function installLifecycleSubscriptions(state) {
  let installed = false

  if (typeof state.gameLifecycleService.onGameLaunched === "function") {
    state.gameLifecycleService.onGameLaunched((event) => {
      state.currentGameSession = {
        state: "running",
        event: GAME_LAUNCHED_EVENT,
        processId:
          typeof event?.processId === "number" ? event.processId : null,
        gameId: toStringId(event?.gameId),
        titleId: toStringId(event?.titleId),
        titleName: safeString(event?.titleName),
        sessionDurationSeconds: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
      }
      void syncGameStatus(state, true)
    })
    installed = true
  }

  if (typeof state.gameLifecycleService.onGameEnded === "function") {
    state.gameLifecycleService.onGameEnded((event) => {
      clearGameSession(
        state,
        GAME_ENDED_EVENT,
        typeof event?.sessionDurationSeconds === "number"
          ? event.sessionDurationSeconds
          : state.currentGameSession.sessionDurationSeconds
      )
      void syncGameStatus(state, true)
    })
    installed = true
  }

  if (installed) {
    state.gameLifecycleSubscriptionsInstalled = true
  }

  return installed
}

function installTrainerVisibilitySubscription(state) {
  if (
    typeof state.trainerVisibilityService.onRunningTrainerChanged !== "function"
  ) {
    return false
  }

  state.trainerVisibilityService.onRunningTrainerChanged((runningTrainer) => {
    state.currentRunningTrainer = normalizeRunningTrainerStatus(
      runningTrainer,
      runningTrainer ? "trainer-running" : "trainer-idle"
    )
    syncGameSessionFromTrainerStatus(state, state.currentRunningTrainer)
    void syncGameStatus(state, true)
  })

  return true
}

function normalizeRunningTrainerStatus(runningTrainer, event = "snapshot") {
  const info = isRecord(runningTrainer?.info)
    ? runningTrainer.info
    : isRecord(runningTrainer)
      ? runningTrainer
      : null
  if (!info) {
    return {
      ...createIdleTrainerStatus(),
      event,
    }
  }

  return {
    state: "running",
    event,
    trainerId: toStringId(info.trainerId) || toStringId(info.id),
    displayName: safeString(
      info.displayName,
      info.gameName,
      info.titleName,
      info.title,
      info.name
    ),
    gameId: toStringId(info.gameId),
    titleId: toStringId(info.titleId),
  }
}

function syncGameSessionFromTrainerStatus(state, trainerStatus) {
  if (trainerStatus?.state === "running") {
    if (
      state.currentGameSession.state === "running" &&
      !isSyntheticGameSessionEvent(state.currentGameSession.event)
    ) {
      return false
    }

    state.currentGameSession = {
      state: "running",
      event: SYNTHETIC_SESSION_RUNNING_EVENT,
      processId: state.currentGameSession.processId,
      gameId: trainerStatus.gameId ?? state.currentGameSession.gameId,
      titleId: trainerStatus.titleId ?? state.currentGameSession.titleId,
      titleName:
        trainerStatus.displayName ?? state.currentGameSession.titleName,
      sessionDurationSeconds: null,
      startedAt:
        state.currentGameSession.state === "running" &&
        isSyntheticGameSessionEvent(state.currentGameSession.event)
          ? state.currentGameSession.startedAt
          : new Date().toISOString(),
      endedAt: null,
    }

    return true
  }

  if (
    state.currentGameSession.state !== "running" ||
    !isSyntheticGameSessionEvent(state.currentGameSession.event)
  ) {
    return false
  }

  const startedAt = state.currentGameSession.startedAt
  const sessionDurationSeconds = startedAt
    ? Math.max(
        0,
        Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
      )
    : null

  clearGameSession(state, SYNTHETIC_SESSION_IDLE_EVENT, sessionDurationSeconds)

  return true
}

function clearGameSession(
  state,
  event,
  sessionDurationSeconds = state.currentGameSession.sessionDurationSeconds
) {
  state.currentGameSession = {
    state: "idle",
    event,
    processId: null,
    gameId: null,
    titleId: null,
    titleName: null,
    sessionDurationSeconds,
    startedAt: state.currentGameSession.startedAt,
    endedAt: new Date().toISOString(),
  }
}

function isSyntheticGameSessionEvent(event) {
  return (
    event === SYNTHETIC_SESSION_RUNNING_EVENT ||
    event === SYNTHETIC_SESSION_IDLE_EVENT
  )
}

function buildGameStatusSnapshot(state) {
  return {
    instanceId: "wand-game-status",
    updatedAt: new Date().toISOString(),
    session: { ...state.currentGameSession },
    trainer: { ...state.currentRunningTrainer },
  }
}

function makeGameStatusSignature(snapshot) {
  return [
    snapshot.session.state,
    snapshot.session.event,
    snapshot.session.processId ?? "",
    snapshot.session.gameId ?? "",
    snapshot.session.titleId ?? "",
    snapshot.session.titleName ?? "",
    snapshot.session.sessionDurationSeconds ?? "",
    snapshot.session.startedAt ?? "",
    snapshot.session.endedAt ?? "",
    snapshot.trainer.state,
    snapshot.trainer.event,
    snapshot.trainer.trainerId ?? "",
    snapshot.trainer.displayName ?? "",
    snapshot.trainer.gameId ?? "",
    snapshot.trainer.titleId ?? "",
  ].join("|")
}
