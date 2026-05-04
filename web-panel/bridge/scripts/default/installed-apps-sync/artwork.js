import {
  DATA_IMAGE_URL_PREFIX,
  IMAGE_FIELD_NAMES,
  MAX_IMAGE_URL_SEARCH_DEPTH,
  PROTOCOL_RELATIVE_IMAGE_URL_PATTERN,
  REMOTE_IMAGE_URL_PATTERN,
  SIDEBAR_GAME_ROW_CONTAINER_SELECTOR,
  SIDEBAR_GAME_ROW_IMAGE_SELECTOR,
  SIDEBAR_GAME_ROW_MORE_SELECTOR,
  SIDEBAR_GAME_ROW_TITLE_SELECTOR,
  SIDEBAR_GAME_ROW_TOOLTIP_ID_PATTERN,
  STEAM_APP_ID_FIELD_NAMES,
  STEAM_APP_ID_PATTERN,
  STEAM_CONTAINER_FIELD_PATTERN,
  STEAM_CONTAINER_ID_FIELD_NAMES,
  STEAM_PLATFORM,
  WEMOD_STEAM_COMMUNITY_CDN_BASE_URL,
} from "./constants.js"
import { isRecord, safeString, toStringId } from "./runtime.js"

export function pickImageUrl(...values) {
  for (const value of values) {
    const imageUrl = normalizeImageUrl(value)
    if (imageUrl) {
      return imageUrl
    }
  }

  return null
}

export function normalizeImageUrl(value, depth = 0) {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (
      REMOTE_IMAGE_URL_PATTERN.test(trimmed) ||
      trimmed.startsWith(DATA_IMAGE_URL_PREFIX)
    ) {
      return trimmed
    }

    if (PROTOCOL_RELATIVE_IMAGE_URL_PATTERN.test(trimmed)) {
      return `https:${trimmed}`
    }

    return null
  }

  if (depth > MAX_IMAGE_URL_SEARCH_DEPTH || !value) {
    return null
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const imageUrl = normalizeImageUrl(entry, depth + 1)
      if (imageUrl) {
        return imageUrl
      }
    }

    return null
  }

  if (!isRecord(value)) {
    return null
  }

  for (const key of IMAGE_FIELD_NAMES) {
    const imageUrl = normalizeImageUrl(value[key], depth + 1)
    if (imageUrl) {
      return imageUrl
    }
  }

  return null
}

export function getSteamClientIconUrl(...values) {
  for (const value of values) {
    const steamAppId = toStringId(value)
    if (steamAppId && STEAM_APP_ID_PATTERN.test(steamAppId)) {
      return `${WEMOD_STEAM_COMMUNITY_CDN_BASE_URL}/${steamAppId}/client_icon/96.webp`
    }
  }

  return null
}

export function getSidebarGameRowClientIcons() {
  const byTitleId = new Map()
  const byTitleName = new Map()
  if (typeof document === "undefined") {
    return { byTitleId, byTitleName }
  }

  const containers = document.querySelectorAll(
    SIDEBAR_GAME_ROW_CONTAINER_SELECTOR
  )
  for (const container of containers) {
    const imageElement = container.querySelector(
      SIDEBAR_GAME_ROW_IMAGE_SELECTOR
    )
    const titleElement = container.querySelector(
      SIDEBAR_GAME_ROW_TITLE_SELECTOR
    )
    const moreButton = container.querySelector(SIDEBAR_GAME_ROW_MORE_SELECTOR)
    if (!imageElement || !titleElement) {
      continue
    }

    const backgroundImageUrl = getCssBackgroundImageUrl(
      safeString(imageElement.style?.backgroundImage) ||
        getComputedStyle(imageElement).backgroundImage
    )
    if (!backgroundImageUrl) {
      continue
    }

    const tooltipId = safeString(
      moreButton?.getAttribute?.("data-tooltip-trigger-for")
    )
    const titleId =
      tooltipId.match(SIDEBAR_GAME_ROW_TOOLTIP_ID_PATTERN)?.[1] ?? null
    const titleName = normalizeTitleMatchKey(titleElement.textContent)

    if (titleId) {
      byTitleId.set(titleId, backgroundImageUrl)
    }

    if (titleName) {
      byTitleName.set(titleName, backgroundImageUrl)
    }
  }

  return { byTitleId, byTitleName }
}

export function getSidebarGameRowClientIconUrl(
  sidebarIcons,
  titleId,
  ...names
) {
  const normalizedTitleId = toStringId(titleId)
  if (normalizedTitleId && sidebarIcons.byTitleId.has(normalizedTitleId)) {
    return sidebarIcons.byTitleId.get(normalizedTitleId) ?? null
  }

  for (const name of names) {
    const normalizedName = normalizeTitleMatchKey(name)
    if (normalizedName && sidebarIcons.byTitleName.has(normalizedName)) {
      return sidebarIcons.byTitleName.get(normalizedName) ?? null
    }
  }

  return null
}

export function findSteamAppId(...roots) {
  const seen = new Set()
  const queue = roots.map((value) => ({ value, depth: 0, steamContext: false }))

  while (queue.length > 0) {
    const current = queue.shift()
    const value = current?.value
    const depth = current?.depth ?? 0
    const steamContext = current?.steamContext ?? false

    if (!value || depth > MAX_IMAGE_URL_SEARCH_DEPTH || seen.has(value)) {
      continue
    }

    if (typeof value === "string" || typeof value === "number") {
      const steamAppId = steamContext ? toStringId(value) : null
      if (steamAppId && STEAM_APP_ID_PATTERN.test(steamAppId)) {
        return steamAppId
      }
      continue
    }

    seen.add(value)

    if (Array.isArray(value)) {
      for (const entry of value) {
        queue.push({ value: entry, depth: depth + 1, steamContext })
      }
      continue
    }

    if (!isRecord(value)) {
      continue
    }

    for (const [key, entry] of Object.entries(value)) {
      const steamAppId = getSteamAppIdFromEntry(key, entry, steamContext)
      if (steamAppId) {
        return steamAppId
      }

      if (isRecord(entry) || Array.isArray(entry)) {
        queue.push({
          value: entry,
          depth: depth + 1,
          steamContext: steamContext || STEAM_CONTAINER_FIELD_PATTERN.test(key),
        })
      }
    }
  }

  return null
}

export function getInstalledAppSteamAppId(platform, sku) {
  if (safeString(platform).toLowerCase() !== STEAM_PLATFORM) {
    return null
  }

  return sku
}

function normalizeTitleMatchKey(value) {
  const normalized = safeString(value).trim().toLowerCase().replace(/\s+/g, " ")
  return normalized || null
}

function getCssBackgroundImageUrl(value) {
  const backgroundImage = safeString(value)
  if (!backgroundImage || backgroundImage === "none") {
    return null
  }

  const match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/i)
  if (!match?.[2]) {
    return null
  }

  return normalizeImageUrl(match[2])
}

function getSteamAppIdFromEntry(key, entry, steamContext) {
  if (STEAM_APP_ID_FIELD_NAMES.has(key)) {
    const steamAppId = toStringId(entry)
    if (steamAppId && STEAM_APP_ID_PATTERN.test(steamAppId)) {
      return steamAppId
    }
  }

  if (steamContext && STEAM_CONTAINER_ID_FIELD_NAMES.has(key)) {
    const steamAppId = toStringId(entry)
    if (steamAppId && STEAM_APP_ID_PATTERN.test(steamAppId)) {
      return steamAppId
    }
  }

  return null
}
