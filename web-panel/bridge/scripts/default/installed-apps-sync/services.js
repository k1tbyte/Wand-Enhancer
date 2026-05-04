import { TRAINER_LAUNCH_REQUEST_EXPORT_KEY } from "./constants.js"
import {
  findExportedConstructor,
  findInstanceInContainerGraph,
  isRecord,
} from "./runtime.js"

export function hasMissingOptionalServices(state) {
  return (
    !state.gameLifecycleService ||
    !state.trainerVisibilityService ||
    !state.unavailableTitlesService
  )
}

const OPTIONAL_SERVICE_SPECS = [
  {
    stateKey: "unavailableTitlesService",
    methods: ["getUnavailableTitle", "searchUnavailableTitles", "getUnavailableTitlesByCorrelationIds"],
    label: "Unavailable titles service",
  },
  {
    stateKey: "gameLifecycleService",
    methods: ["onGameLaunched", "onGameEnded", "launch"],
    label: "Game lifecycle service",
  },
  {
    stateKey: "trainerVisibilityService",
    methods: ["onDisplayTrainerChanged", "onVisibleTrainerChanged", "onRunningTrainerChanged"],
    label: "Trainer visibility service",
  },
  {
    stateKey: "trainerApiService",
    methods: ["getLatestLocalTrainerForGame", "getMostCompatibleTrainerForGame", "getTrainerById"],
    label: "Trainer API service",
  },
  {
    stateKey: "trainerService",
    methods: ["launch", "endTrainer", "onNewTrainer", "onTrainerEnded"],
    label: "Trainer service",
  },
]

export function resolveOptionalServices(state, container, webpackRequire) {
  for (const spec of OPTIONAL_SERVICE_SPECS) {
    if (!state[spec.stateKey]) {
      state[spec.stateKey] = resolveOptionalService(state, container, webpackRequire, spec)
    }
  }

  if (!state.trainerLaunchRequestCtor) {
    state.trainerLaunchRequestCtor = getTrainerLaunchRequestCtor(state, webpackRequire)
  }
}

export function getInstalledAppsService(state, container, webpackRequire) {
  const ctor = findExportedConstructor(webpackRequire, (prototype) => {
    return (
      typeof prototype.refreshApps === "function" &&
      typeof prototype.watchGame === "function"
    )
  })

  if (!ctor) {
    state.log(
      "warn",
      "Installed apps service constructor not found in webpack cache."
    )
    return null
  }

  try {
    const service = container.get(ctor)
    const appsCount = isRecord(service.installedApps)
      ? Object.keys(service.installedApps).length
      : -1
    const catalogGamesCount = isRecord(service.catalog?.games)
      ? Object.keys(service.catalog.games).length
      : -1
    state.log(
      "info",
      "Installed apps service resolved.",
      `ctor=${ctor.name || "<anon>"}, installedApps=${appsCount}, catalogGames=${catalogGamesCount}`
    )
    return service
  } catch (error) {
    state.log(
      "warn",
      "Failed to resolve installed apps service from Aurelia container.",
      error?.stack || String(error)
    )
    return null
  }
}

export function getStoreRef(state, container, webpackRequire) {
  const storeCtor = findExportedConstructor(webpackRequire, (prototype) => {
    return (
      typeof prototype.dispatch === "function" &&
      typeof prototype.registerAction === "function" &&
      typeof prototype.unregisterAction === "function"
    )
  })

  if (!storeCtor) {
    state.log("warn", "Store constructor not found in webpack cache.")
    return null
  }

  try {
    const store = container.get(storeCtor)
    const storeState =
      typeof store.state?.getValue === "function"
        ? store.state.getValue()
        : null
    const installedAppsCount = isRecord(storeState?.installedApps)
      ? Object.keys(storeState.installedApps).length
      : -1
    const catalogGamesCount = isRecord(storeState?.catalog?.games)
      ? Object.keys(storeState.catalog.games).length
      : -1
    state.log(
      "info",
      "Store resolved via fallback.",
      `ctor=${storeCtor.name || "<anon>"}, installedApps=${installedAppsCount}, catalogGames=${catalogGamesCount}`
    )
    return store
  } catch (error) {
    state.log(
      "warn",
      "Failed to resolve Store from container.",
      error?.stack || String(error)
    )
    return null
  }
}

function resolveOptionalService(state, container, webpackRequire, spec) {
  const matchesMethods = (target) => hasAllMethods(target, spec.methods)
  const ctor = findExportedConstructor(webpackRequire, matchesMethods)
  if (ctor) {
    return getContainerService(state, container, ctor, spec.stateKey, spec.label)
  }

  return findFallbackService(
    state,
    container,
    spec.stateKey,
    `${spec.label} constructor not found in webpack cache.`,
    matchesMethods
  )
}

function hasAllMethods(target, methods) {
  if (!target) {
    return false
  }

  for (const method of methods) {
    if (typeof target[method] !== "function") {
      return false
    }
  }

  return true
}

function getTrainerLaunchRequestCtor(state, webpackRequire) {
  const cache = webpackRequire?.c
  if (!cache || typeof cache !== "object") {
    warnMissingOptionalService(
      state,
      "trainerLaunchRequestCtor",
      "Trainer launch request constructor cache is unavailable."
    )
    return null
  }

  for (const record of Object.values(cache)) {
    const exports = record?.exports
    if (!isRecord(exports)) {
      continue
    }

    const candidate = exports[TRAINER_LAUNCH_REQUEST_EXPORT_KEY]
    if (
      typeof candidate === "function" &&
      typeof exports.ZS === "function" &&
      typeof exports.jR === "function" &&
      typeof exports.UY === "function"
    ) {
      clearMissingOptionalServiceWarning(state, "trainerLaunchRequestCtor")
      return candidate
    }
  }

  warnMissingOptionalService(
    state,
    "trainerLaunchRequestCtor",
    "Trainer launch request constructor not found in webpack cache."
  )
  return null
}

function getContainerService(state, container, ctor, warningKey, label) {
  try {
    const service = container.get(ctor)
    clearMissingOptionalServiceWarning(state, warningKey)
    state.log(
      "info",
      `${label} resolved.`,
      `ctor=${ctor.name || "<anon>"}${service?.runningTrainer ? ", running=yes" : ""}`
    )
    return service
  } catch (error) {
    state.log(
      "warn",
      `Failed to resolve ${label.toLowerCase()} from Aurelia container.`,
      error?.stack || String(error)
    )
    return null
  }
}

function findFallbackService(
  state,
  container,
  warningKey,
  missingMessage,
  predicate
) {
  const fallbackService = findInstanceInContainerGraph(container, predicate)
  if (fallbackService) {
    clearMissingOptionalServiceWarning(state, warningKey)
    state.log("info", `${warningKey} resolved from container graph.`)
    return fallbackService
  }

  warnMissingOptionalService(state, warningKey, missingMessage)
  return null
}

function warnMissingOptionalService(state, key, message) {
  if (state.missingOptionalServiceWarnings.has(key)) {
    return
  }

  state.missingOptionalServiceWarnings.add(key)
  state.log("warn", message)
}

function clearMissingOptionalServiceWarning(state, key) {
  state.missingOptionalServiceWarnings.delete(key)
}
