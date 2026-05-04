import {
  EXCLUDED_UNAVAILABLE_TITLE_PLATFORMS,
  SNAPSHOT_ENTRY_KEY_PREFIX,
  UNAVAILABLE_TITLES_BATCH_SIZE,
} from "./constants.js"
import {
  findSteamAppId,
  getInstalledAppSteamAppId,
  getSidebarGameRowClientIconUrl,
  getSidebarGameRowClientIcons,
  getSteamClientIconUrl,
  pickImageUrl,
} from "./artwork.js"
import {
  getBasename,
  isRecord,
  normalizeStringList,
  safeString,
  toStringId,
} from "./runtime.js"

export function resolveInstalledData(state) {
  const storeState = getStoreState(state.storeRef)

  if (isRecord(state.installedAppsService?.installedApps)) {
    return {
      rawInstalledApps: state.installedAppsService.installedApps,
      catalog: isRecord(state.installedAppsService.catalog)
        ? state.installedAppsService.catalog
        : isRecord(storeState?.catalog)
          ? storeState.catalog
          : {},
      installedGameVersions: isRecord(
        state.installedAppsService.installedVersions
      )
        ? state.installedAppsService.installedVersions
        : isRecord(storeState?.installedGameVersions)
          ? storeState.installedGameVersions
          : {},
      correlatedUnavailableTitles: getResolvedUnavailableTitles(
        state,
        storeState?.correlatedUnavailableTitles
      ),
      source: "service",
    }
  }

  if (isRecord(storeState?.installedApps)) {
    return {
      rawInstalledApps: storeState.installedApps,
      catalog: isRecord(storeState.catalog) ? storeState.catalog : {},
      installedGameVersions: isRecord(storeState.installedGameVersions)
        ? storeState.installedGameVersions
        : {},
      correlatedUnavailableTitles: getResolvedUnavailableTitles(
        state,
        storeState.correlatedUnavailableTitles
      ),
      source: "store",
    }
  }

  return null
}

export async function refreshUnavailableTitles(
  state,
  rawInstalledApps,
  force = false
) {
  if (!state.unavailableTitlesService) {
    return state.unavailableTitlesById
  }

  const correlationIds = getCorrelationIdsForUnavailableTitles(rawInstalledApps)
  const fetchKey = correlationIds.join("\n")
  if (!fetchKey) {
    state.unavailableTitlesFetchKey = ""
    state.unavailableTitlesById = {}
    return state.unavailableTitlesById
  }

  if (!force && fetchKey === state.unavailableTitlesFetchKey) {
    if (state.unavailableTitlesFetchPromise) {
      await state.unavailableTitlesFetchPromise
    }
    return state.unavailableTitlesById
  }

  state.unavailableTitlesFetchKey = fetchKey
  state.unavailableTitlesFetchPromise = fetchUnavailableTitles(
    state,
    correlationIds
  )
  await state.unavailableTitlesFetchPromise
  return state.unavailableTitlesById
}

export function buildSnapshot(state) {
  const data = resolveInstalledData(state)
  if (!data) {
    if (state.installedAppsService) {
      state.log(
        "warn",
        "Service resolved but installedApps is empty/undefined. Store fallback also unavailable."
      )
    }
    return null
  }

  const {
    rawInstalledApps,
    catalog,
    installedGameVersions,
    correlatedUnavailableTitles,
    source,
  } = data
  const catalogGames = isRecord(catalog.games) ? catalog.games : {}
  const catalogTitles = isRecord(catalog.titles) ? catalog.titles : {}
  const sidebarGameRowClientIcons = getSidebarGameRowClientIcons()
  const entriesByKey = new Map()
  let matchedCatalogGames = 0
  let matchedUnavailableGames = 0

  state.log(
    "info",
    `Building snapshot from ${source}.`,
    `rawInstalledApps=${Object.keys(rawInstalledApps).length}, catalogGames=${Object.keys(catalogGames).length}, installedGameVersions=${Object.keys(installedGameVersions).length}, unavailableTitles=${Object.keys(correlatedUnavailableTitles).length}`
  )

  for (const [gameId, versions] of Object.entries(installedGameVersions)) {
    if (!Array.isArray(versions)) {
      continue
    }

    const game = catalogGames[gameId]
    if (!isRecord(game)) {
      continue
    }

    const preferredApp = pickPreferredInstalledApp(
      rawInstalledApps,
      getCatalogGameCorrelationIds(game, versions)
    )
    if (!preferredApp) {
      continue
    }

    const titleId = toStringId(game.titleId)
    const title = titleId
      ? catalogTitles[titleId] || catalogTitles[game.titleId] || null
      : null
    const sidebarClientIconUrl = getSidebarGameRowClientIconUrl(
      sidebarGameRowClientIcons,
      titleId,
      title?.name,
      title?.displayName,
      game.displayName,
      game.title,
      game.name,
      preferredApp.displayName
    )

    upsertSnapshotEntry(entriesByKey, {
      ...preferredApp,
      displayName: safeString(
        title?.name,
        title?.displayName,
        game.displayName,
        game.title,
        game.name,
        preferredApp.displayName,
        gameId
      ),
      imageUrl: pickImageUrlForTitle(title, game, preferredApp, sidebarClientIconUrl, versions),
      gameId: String(gameId),
      titleId,
    })
    matchedCatalogGames += 1
  }

  for (const unavailableTitle of Object.values(correlatedUnavailableTitles)) {
    if (!isRecord(unavailableTitle) || !Array.isArray(unavailableTitle.games)) {
      continue
    }

    const titleId = toStringId(unavailableTitle.id)
    for (const game of unavailableTitle.games) {
      if (!isRecord(game) || !Array.isArray(game.correlationIds)) {
        continue
      }

      const preferredApp = pickPreferredInstalledApp(
        rawInstalledApps,
        game.correlationIds
      )
      if (!preferredApp) {
        continue
      }

      const sidebarClientIconUrl = getSidebarGameRowClientIconUrl(
        sidebarGameRowClientIcons,
        titleId,
        unavailableTitle.name,
        game.name,
        preferredApp.displayName
      )
      upsertSnapshotEntry(entriesByKey, {
        ...preferredApp,
        displayName: safeString(
          unavailableTitle.name,
          game.name,
          preferredApp.displayName,
          preferredApp.correlationId
        ),
        imageUrl: pickImageUrlForTitle(unavailableTitle, game, preferredApp, sidebarClientIconUrl),
        gameId: toStringId(game.id),
        titleId,
      })
      matchedUnavailableGames += 1
    }
  }

  const apps = Array.from(entriesByKey.values()).sort(compareSnapshotEntries)

  return {
    instanceId: "wand-installed-apps",
    updatedAt: new Date().toISOString(),
    apps,
    diagnostics: {
      catalogGames: Object.keys(catalogGames).length,
      catalogTitles: Object.keys(catalogTitles).length,
      installedGameVersions: Object.keys(installedGameVersions).length,
      correlatedUnavailableTitles: Object.keys(correlatedUnavailableTitles)
        .length,
      matchedCatalogGames,
      matchedUnavailableGames,
      myGames: apps.length,
      rawInstalledApps: Object.keys(rawInstalledApps).length,
    },
  }
}

export function makeInstalledAppsSignature(snapshot) {
  return snapshot.apps
    .map((app) =>
      [
        app.platform,
        app.sku,
        app.displayName,
        app.gameId ?? "",
        app.titleId ?? "",
        app.location,
        app.imageUrl ?? "",
        app.platformLastPlayedTimestamp ?? "",
        app.platformTotalPlaytimeMinutes ?? "",
      ].join("|")
    )
    .join("\n")
}

export function toInstalledAppRecord(correlationId, app) {
  if (
    !isRecord(app) ||
    typeof correlationId !== "string" ||
    !correlationId.trim()
  ) {
    return null
  }

  const [fallbackPlatform, fallbackSku] = correlationId.split(":")
  const platform = safeString(app.platform, fallbackPlatform)
  const sku = safeString(app.sku, fallbackSku)
  if (!platform || !sku) {
    return null
  }

  const location = typeof app.location === "string" ? app.location : ""
  const alternateLocations = normalizeStringList(app.alternateLocations)

  return {
    platform,
    sku,
    correlationId,
    displayName: safeString(
      app.displayName,
      app.titleName,
      app.gameName,
      app.name,
      getBasename(location),
      correlationId
    ),
    location,
    alternateLocations,
    imageUrl: pickImageUrl(
      app.imageUrl,
      app.iconUrl,
      app.coverUrl,
      app.thumbnailUrl,
      app.logoUrl,
      app.headerImageUrl,
      app.icon,
      app.images,
      app.assets,
      getSteamClientIconUrl(
        findSteamAppId(app),
        getInstalledAppSteamAppId(platform, sku)
      )
    ),
    platformLastPlayedTimestamp:
      typeof app.platformLastPlayedTimestamp === "number"
        ? app.platformLastPlayedTimestamp
        : null,
    platformTotalPlaytimeMinutes:
      typeof app.platformTotalPlaytimeMinutes === "number"
        ? app.platformTotalPlaytimeMinutes
        : null,
  }
}

export function compareInstalledAppRecords(left, right) {
  const lastPlayedDiff =
    (right.platformLastPlayedTimestamp ?? 0) -
    (left.platformLastPlayedTimestamp ?? 0)
  if (lastPlayedDiff !== 0) {
    return lastPlayedDiff
  }

  const playtimeDiff =
    (right.platformTotalPlaytimeMinutes ?? 0) -
    (left.platformTotalPlaytimeMinutes ?? 0)
  if (playtimeDiff !== 0) {
    return playtimeDiff
  }

  return compareByIdentity(left, right)
}

export function getInstalledVersionsForGame(gameId, data) {
  const versions = Array.isArray(data?.installedGameVersions?.[gameId])
    ? data.installedGameVersions[gameId]
    : []
  return Array.from(
    new Set(
      versions
        .map((entry) => entry?.version)
        .filter(
          (entry) => typeof entry === "string" || typeof entry === "number"
        )
    )
  )
}

function getStoreState(storeRef) {
  const state =
    typeof storeRef?.state?.getValue === "function"
      ? storeRef.state.getValue()
      : null
  return isRecord(state) ? state : null
}

function getResolvedUnavailableTitles(state, liveTitles) {
  const liveCount = isRecord(liveTitles) ? Object.keys(liveTitles).length : 0
  return liveCount > 0 ? liveTitles : state.unavailableTitlesById
}

function getCorrelationIdsForUnavailableTitles(rawInstalledApps) {
  return Object.entries(rawInstalledApps)
    .filter(
      ([, app]) =>
        isRecord(app) &&
        !EXCLUDED_UNAVAILABLE_TITLE_PLATFORMS.has(safeString(app.platform))
    )
    .map(([correlationId]) => correlationId)
    .sort()
}

async function fetchUnavailableTitles(state, correlationIds) {
  const nextTitlesById = {}

  try {
    for (
      let index = 0;
      index < correlationIds.length;
      index += UNAVAILABLE_TITLES_BATCH_SIZE
    ) {
      const batch = correlationIds.slice(
        index,
        index + UNAVAILABLE_TITLES_BATCH_SIZE
      )
      const response =
        await state.unavailableTitlesService.getUnavailableTitlesByCorrelationIds(
          batch
        )
      for (const title of normalizeUnavailableTitlesResponse(response)) {
        nextTitlesById[title.id] = title
      }
    }

    state.unavailableTitlesById = nextTitlesById
    state.log(
      "info",
      "Unavailable titles refreshed.",
      `correlationIds=${correlationIds.length}, titles=${Object.keys(nextTitlesById).length}`
    )
  } catch (error) {
    state.log(
      "warn",
      "Unavailable titles refresh failed.",
      error?.stack || String(error)
    )
  } finally {
    state.unavailableTitlesFetchPromise = null
  }
}

function normalizeUnavailableTitlesResponse(value) {
  const titles = Array.isArray(value)
    ? value
    : Array.isArray(value?.data)
      ? value.data
      : []
  return titles.map(normalizeUnavailableTitle).filter(Boolean)
}

function normalizeUnavailableTitle(title) {
  if (!isRecord(title)) {
    return null
  }

  const titleId = toStringId(title.id ?? title.titleId)
  if (!titleId) {
    return null
  }

  const games = Array.isArray(title.games)
    ? title.games.map(normalizeUnavailableTitleGame).filter(Boolean)
    : []
  if (games.length === 0) {
    return null
  }

  return {
    ...title,
    id: titleId,
    name: safeString(title.name, title.titleName, titleId),
    games,
  }
}

function normalizeUnavailableTitleGame(game) {
  if (!isRecord(game)) {
    return null
  }

  const gameId = toStringId(game.id ?? game.gameId)
  const correlationIds = normalizeStringList(game.correlationIds)
  if (!gameId || correlationIds.length === 0) {
    return null
  }

  return {
    ...game,
    id: gameId,
    platformId: safeString(game.platformId, "unknown"),
    correlationIds,
    flags: typeof game.flags === "number" ? game.flags : 0,
    name: safeString(game.name, game.titleName, game.title, gameId),
  }
}

function getCatalogGameCorrelationIds(game, versions) {
  const correlationIds = []

  if (Array.isArray(game.correlationIds)) {
    for (const correlationId of game.correlationIds) {
      if (typeof correlationId === "string" && correlationId.trim()) {
        correlationIds.push(correlationId.trim())
      }
    }
  }

  for (const version of versions) {
    if (
      typeof version?.correlationId === "string" &&
      version.correlationId.trim()
    ) {
      correlationIds.push(version.correlationId.trim())
    }
  }

  return correlationIds
}

function pickPreferredInstalledApp(rawInstalledApps, correlationIds) {
  const candidates = Array.from(new Set(correlationIds))
    .map((correlationId) =>
      toInstalledAppRecord(correlationId, rawInstalledApps[correlationId])
    )
    .filter(Boolean)
    .sort(compareInstalledAppRecords)

  return candidates[0] || null
}

function upsertSnapshotEntry(entriesByKey, entry) {
  const key = getSnapshotEntryKey(entry)
  const current = entriesByKey.get(key)
  if (!current || compareSnapshotEntries(entry, current) < 0) {
    entriesByKey.set(key, entry)
  }
}

function getSnapshotEntryKey(entry) {
  if (entry.titleId) {
    return `${SNAPSHOT_ENTRY_KEY_PREFIX.TITLE}${entry.titleId}`
  }

  if (entry.gameId) {
    return `${SNAPSHOT_ENTRY_KEY_PREFIX.GAME}${entry.gameId}`
  }

  return `${SNAPSHOT_ENTRY_KEY_PREFIX.APP}${entry.correlationId}`
}

function compareSnapshotEntries(left, right) {
  const lastPlayedDiff =
    (right.platformLastPlayedTimestamp ?? 0) -
    (left.platformLastPlayedTimestamp ?? 0)
  if (lastPlayedDiff !== 0) {
    return lastPlayedDiff
  }

  const playtimeDiff =
    (right.platformTotalPlaytimeMinutes ?? 0) -
    (left.platformTotalPlaytimeMinutes ?? 0)
  if (playtimeDiff !== 0) {
    return playtimeDiff
  }

  return compareByIdentity(left, right)
}

function compareByIdentity(left, right) {
  const displayNameDiff = left.displayName.localeCompare(right.displayName)
  if (displayNameDiff !== 0) {
    return displayNameDiff
  }

  const platformDiff = left.platform.localeCompare(right.platform)
  if (platformDiff !== 0) {
    return platformDiff
  }

  return left.sku.localeCompare(right.sku)
}

function pickImageUrlForTitle(title, game, preferredApp, sidebarClientIconUrl, versions) {
  const steamRoots = versions !== undefined
    ? [title, game, versions, preferredApp]
    : [title, game, preferredApp]

  return pickImageUrl(
    title?.imageUrl,
    title?.iconUrl,
    title?.coverUrl,
    title?.thumbnailUrl,
    title?.logoUrl,
    title?.headerImageUrl,
    getSteamClientIconUrl(
      findSteamAppId(...steamRoots),
      getInstalledAppSteamAppId(preferredApp.platform, preferredApp.sku)
    ),
    sidebarClientIconUrl,
    title?.images,
    title?.assets,
    game.imageUrl,
    game.iconUrl,
    game.coverUrl,
    game.thumbnailUrl,
    game.logoUrl,
    game.headerImageUrl,
    game.images,
    game.assets,
    preferredApp.imageUrl
  )
}
