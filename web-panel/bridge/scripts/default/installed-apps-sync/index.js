import {
  BIND_CHANNEL,
  BOOTSTRAP_LOG_THROTTLE_ATTEMPTS,
  COMMAND_REQUEST_CHANNEL,
  FOLLOW_UP_SYNC_DELAY_MS,
  GLOBAL_FLAG,
  MAX_BOOTSTRAP_ATTEMPTS,
  OPTIONAL_SERVICES_RETRY_INTERVAL_MS,
  RETRY_DELAY_MS,
  SYNC_CHANNEL,
  SYNC_INTERVAL_MS,
} from "./constants.js"
import {
  createIdleGameSession,
  createIdleTrainerStatus,
  installGameStatusSubscriptions,
} from "./game-status.js"
import {
  buildSnapshot,
  makeInstalledAppsSignature,
  refreshUnavailableTitles,
  resolveInstalledData,
} from "./installed-data.js"
import { createLogger } from "./logger.js"
import { handleRemoteCommandRequest } from "./remote-commands.js"
import {
  getAppRoot,
  getAureliaContainer,
  getRequire,
  getWebpackRequire,
  hasAppRoot,
  isRecord,
  summarizeAureliaSubtree,
} from "./runtime.js"
import {
  getInstalledAppsService,
  getStoreRef,
  hasMissingOptionalServices,
  resolveOptionalServices,
} from "./services.js"

export function installInstalledAppsSync(WandEnhancer) {
  if (globalThis[GLOBAL_FLAG]) {
    return
  }

  globalThis[GLOBAL_FLAG] = true

  const state = createState(WandEnhancer)
  state.resolveRemoteCommandServices = () => resolveRemoteCommandServices(state)
  state.queueSync = (force = false) => queueSync(state, force)
  state.queueFollowUpSync = () => queueFollowUpSync(state)

  state.log(
    "info",
    "Script loaded.",
    `logFile=${globalThis.__wandInstalledAppsSyncLogFile || "console-only"}`
  )
  retryBootstrap(state)
}

function createState(WandEnhancer) {
  return {
    WandEnhancer,
    log: createLogger(WandEnhancer),
    lastSignature: null,
    lastGameStatusSignature: null,
    refreshTimer: null,
    followUpSyncTimer: null,
    pollTimer: null,
    optionalServicesTimer: null,
    bootstrapAttempts: 0,
    bridgeBound: false,
    refreshPatched: false,
    installedAppsService: null,
    gameLifecycleService: null,
    trainerVisibilityService: null,
    unavailableTitlesService: null,
    storeRef: null,
    ipcRenderer: null,
    lastBootstrapReason: null,
    gameLifecycleSubscriptionsInstalled: false,
    trainerVisibilitySubscriptionInstalled: false,
    trainerEndedSubscriptionInstalled: false,
    unavailableTitlesFetchKey: null,
    unavailableTitlesFetchPromise: null,
    unavailableTitlesById: {},
    trainerApiService: null,
    trainerService: null,
    trainerLaunchRequestCtor: null,
    commandListenerInstalled: false,
    missingOptionalServiceWarnings: new Set(),
    currentGameSession: createIdleGameSession(),
    currentRunningTrainer: createIdleTrainerStatus(),
    resolveRemoteCommandServices: null,
    queueSync: null,
    queueFollowUpSync: null,
  }
}

function setBootstrapReason(state, reason) {
  if (
    reason === state.lastBootstrapReason &&
    state.bootstrapAttempts % BOOTSTRAP_LOG_THROTTLE_ATTEMPTS !== 0
  ) {
    return
  }

  state.lastBootstrapReason = reason
  state.log(
    "info",
    `Bootstrap waiting: ${reason}.`,
    `attempt=${state.bootstrapAttempts + 1}/${MAX_BOOTSTRAP_ATTEMPTS}`
  )
}

function bindBridge(state) {
  if (state.bridgeBound || !state.ipcRenderer) {
    return
  }

  state.bridgeBound = true

  if (!state.commandListenerInstalled) {
    state.ipcRenderer.on(COMMAND_REQUEST_CHANNEL, (event, request) =>
      handleRemoteCommandRequest(state, event, request)
    )
    state.commandListenerInstalled = true
    state.log("info", "Bridge remote command handler installed.")
  }

  try {
    void state.ipcRenderer.invoke(BIND_CHANNEL)
    state.log("info", "Bridge set-value handler bind requested.")
  } catch (error) {
    state.log("warn", "Bridge bind failed.", error?.stack || String(error))
  }
}

async function syncInstalledApps(state, force = false) {
  if (!state.ipcRenderer || (!state.installedAppsService && !state.storeRef)) {
    return false
  }

  const data = resolveInstalledData(state)
  if (!data) {
    if (state.installedAppsService) {
      state.log(
        "warn",
        "Service resolved but installedApps is empty/undefined. Store fallback also unavailable."
      )
    }
    return false
  }

  if (Object.keys(data.rawInstalledApps).length > 0) {
    await refreshUnavailableTitles(state, data.rawInstalledApps, force)
  }

  const snapshot = buildSnapshot(state)
  if (!snapshot) {
    state.log("warn", "Snapshot build returned nothing.")
    return false
  }

  const signature = makeInstalledAppsSignature(snapshot)
  if (!force && signature === state.lastSignature) {
    return false
  }

  state.lastSignature = signature

  try {
    await state.ipcRenderer.invoke(SYNC_CHANNEL, snapshot)
    state.log(
      "info",
      "Installed apps snapshot sent.",
      `apps=${snapshot.apps.length}, catalogGames=${snapshot.diagnostics.catalogGames}, rawInstalledApps=${snapshot.diagnostics.rawInstalledApps}`
    )
    return true
  } catch (error) {
    state.log(
      "error",
      "Installed apps snapshot IPC failed.",
      error?.stack || String(error)
    )
    return false
  }
}

function queueSync(state, force = false) {
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer)
  }

  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null
    void syncInstalledApps(state, force)
  }, 0)
}

function queueFollowUpSync(state) {
  if (state.followUpSyncTimer) {
    clearTimeout(state.followUpSyncTimer)
  }

  state.followUpSyncTimer = setTimeout(() => {
    state.followUpSyncTimer = null
    void syncInstalledApps(state, true)
  }, FOLLOW_UP_SYNC_DELAY_MS)
}

function patchRefreshApps(state) {
  if (
    !state.installedAppsService ||
    state.refreshPatched ||
    typeof state.installedAppsService.refreshApps !== "function"
  ) {
    return
  }

  const originalRefreshApps = state.installedAppsService.refreshApps.bind(
    state.installedAppsService
  )
  state.refreshPatched = true
  state.log("info", "refreshApps hook installed.")

  state.installedAppsService.refreshApps = async (...args) => {
    const result = await originalRefreshApps(...args)
    state.log("info", "refreshApps completed; queueing installed apps sync.")
    queueSync(state, true)
    queueFollowUpSync(state)
    return result
  }
}

function resolveRemoteCommandServices(state) {
  const container = getAureliaContainer()
  const webpackRequire = getWebpackRequire()
  if (!container || !webpackRequire) {
    return false
  }

  resolveRuntimeServices(state, container, webpackRequire)
  return true
}

function resolveRuntimeServices(state, container, webpackRequire) {
  resolveOptionalServices(state, container, webpackRequire)
  installGameStatusSubscriptions(state)

  if (!hasMissingOptionalServices(state)) {
    stopOptionalServicesRetry(state)
  }
}

function stopOptionalServicesRetry(state) {
  if (!state.optionalServicesTimer) {
    return
  }

  clearInterval(state.optionalServicesTimer)
  state.optionalServicesTimer = null
}

function startOptionalServicesRetry(state) {
  if (state.optionalServicesTimer || !hasMissingOptionalServices(state)) {
    return
  }

  state.optionalServicesTimer = setInterval(() => {
    const container = getAureliaContainer()
    const webpackRequire = getWebpackRequire()
    if (container && webpackRequire) {
      resolveRuntimeServices(state, container, webpackRequire)
    }
  }, OPTIONAL_SERVICES_RETRY_INTERVAL_MS)

  state.log(
    "info",
    "Optional service retry timer started.",
    `${OPTIONAL_SERVICES_RETRY_INTERVAL_MS}ms`
  )
}

function bootstrap(state) {
  if (!hasAppRoot()) {
    setBootstrapReason(state, "app root not ready")
    return false
  }

  if (!state.ipcRenderer && !resolveIpcRenderer(state)) {
    return false
  }

  const webpackRequire = getWebpackRequire()
  if (!webpackRequire) {
    setBootstrapReason(state, "webpack runtime not ready")
    return false
  }

  const container = getAureliaContainer()
  if (!container) {
    logMissingContainer(state)
    setBootstrapReason(state, "Aurelia container not ready")
    return false
  }

  state.log("info", "Aurelia container resolved.")

  if (!state.storeRef) {
    state.storeRef = getStoreRef(state, container, webpackRequire)
    if (!state.storeRef) {
      state.log(
        "warn",
        "Store reference unavailable; unsupported installed titles will be missing."
      )
    }
  }

  state.installedAppsService = getInstalledAppsService(
    state,
    container,
    webpackRequire
  )
  if (!state.installedAppsService) {
    setBootstrapReason(state, "installed apps service not ready")
    return false
  }

  resolveRuntimeServices(state, container, webpackRequire)
  startOptionalServicesRetry(state)

  if (!isRecord(state.installedAppsService.installedApps)) {
    state.log(
      "info",
      "Service instance has no installedApps data yet; reading from store until refreshApps populates it."
    )
    if (!state.storeRef) {
      state.log("warn", "Store fallback also unavailable; will retry on poll.")
    }
  }

  bindBridge(state)
  patchRefreshApps(state)
  queueSync(state, true)
  queueFollowUpSync(state)
  startPollTimer(state)

  state.log("info", "Installed apps sync ready.")
  return true
}

function resolveIpcRenderer(state) {
  const electron = getRequire()?.("electron")
  if (!electron?.ipcRenderer) {
    setBootstrapReason(state, "electron ipcRenderer not ready")
    return false
  }

  state.ipcRenderer = electron.ipcRenderer
  state.log("info", "Electron ipcRenderer resolved.")
  return true
}

function startPollTimer(state) {
  if (state.pollTimer) {
    return
  }

  state.pollTimer = setInterval(() => {
    const container = getAureliaContainer()
    const webpackRequire = getWebpackRequire()
    if (container && webpackRequire) {
      resolveRuntimeServices(state, container, webpackRequire)
    }
    void syncInstalledApps(state)
  }, SYNC_INTERVAL_MS)

  state.log(
    "info",
    "Installed apps poll timer started.",
    `${SYNC_INTERVAL_MS}ms`
  )
}

function logMissingContainer(state) {
  if (state.bootstrapAttempts % 10 !== 0) {
    return
  }

  const root = getAppRoot()
  const aureliaKeys = root
    ? Object.getOwnPropertyNames(root)
        .filter((key) => key.startsWith("__") || key === "au")
        .join(", ")
    : "root=null"
  state.log(
    "warn",
    "Aurelia container not found.",
    `rootProps=${aureliaKeys || "(none)"}, subtree=${summarizeAureliaSubtree(root)}`
  )
}

function retryBootstrap(state) {
  if (bootstrap(state)) {
    return
  }

  state.bootstrapAttempts += 1
  if (state.bootstrapAttempts < MAX_BOOTSTRAP_ATTEMPTS) {
    setTimeout(() => retryBootstrap(state), RETRY_DELAY_MS)
    return
  }

  state.log(
    "error",
    "Installed apps sync bootstrap exhausted.",
    state.lastBootstrapReason || "unknown reason"
  )
}
