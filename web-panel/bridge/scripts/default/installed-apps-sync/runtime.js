export function isRecord(value) {
  return typeof value === "object" && value !== null
}

export function getRequire() {
  return (
    globalThis.require ||
    (typeof window !== "undefined" ? window.require : null)
  )
}

export function safeString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return ""
}

export function getWebpackRequire() {
  const chunk = globalThis.webpackChunkWeMod
  if (!Array.isArray(chunk)) {
    return null
  }

  if (typeof chunk.__wandWebpackRequire === "function") {
    return chunk.__wandWebpackRequire
  }

  let resolvedRequire = null
  chunk.push([
    [`wand-enhancer-${Date.now()}`],
    {},
    (webpackRequire) => {
      resolvedRequire = webpackRequire
    },
  ])

  if (typeof resolvedRequire === "function") {
    chunk.__wandWebpackRequire = resolvedRequire
  }

  return resolvedRequire
}

export function getAppRoot() {
  return (
    document.getElementById("root") ||
    document.querySelector("[aurelia-app]") ||
    document.querySelector("root")
  )
}

export function hasAppRoot() {
  return Boolean(getAppRoot())
}

export function getAureliaContainer() {
  const root = getAppRoot()
  const rootContainer = getContainerFromSubtree(root)
  if (rootContainer) {
    return rootContainer
  }

  const bodyContainer = getContainerFromElement(document.body)
  if (bodyContainer) {
    return bodyContainer
  }

  if (isRecord(globalThis.aurelia) && globalThis.aurelia.container) {
    return globalThis.aurelia.container
  }

  return null
}

export function summarizeAureliaSubtree(root) {
  if (!root) {
    return "root=null"
  }

  let elementsWithAu = 0
  let controllerEntries = 0
  let namedAuEntries = 0

  function inspectElement(element) {
    if (!isRecord(element?.au)) {
      return
    }

    elementsWithAu += 1

    if (element.au.controller) {
      controllerEntries += 1
    }

    for (const [key, value] of Object.entries(element.au)) {
      if (key !== "controller" && isRecord(value)) {
        namedAuEntries += 1
      }
    }
  }

  inspectElement(root)

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let element = walker.nextNode()
  while (element) {
    inspectElement(element)
    element = walker.nextNode()
  }

  return `elementsWithAu=${elementsWithAu}, controllerEntries=${controllerEntries}, namedAuEntries=${namedAuEntries}`
}

export function findExportedConstructor(webpackRequire, predicate) {
  const cache = webpackRequire?.c
  if (!cache || typeof cache !== "object") {
    return null
  }

  for (const record of Object.values(cache)) {
    const exports = record?.exports
    const candidates = []

    if (typeof exports === "function") {
      candidates.push(exports)
    } else if (isRecord(exports)) {
      if (typeof exports.default === "function") {
        candidates.push(exports.default)
      }

      for (const value of Object.values(exports)) {
        if (typeof value === "function") {
          candidates.push(value)
        }
      }
    }

    for (const candidate of candidates) {
      if (candidate?.prototype && predicate(candidate.prototype)) {
        return candidate
      }
    }
  }

  return null
}

export function findInstanceInContainerGraph(root, predicate, maxDepth = 4) {
  if (!root) {
    return null
  }

  const seen = new Set()
  const queue = [{ value: root, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()
    const value = current?.value
    const depth = current?.depth ?? 0
    if (!value || seen.has(value)) {
      continue
    }

    seen.add(value)

    try {
      if (predicate(value)) {
        return value
      }
    } catch (error) {}

    if (depth >= maxDepth) {
      continue
    }

    enqueueNestedValues(queue, seen, value, depth + 1)
  }

  return null
}

export function getBasename(location) {
  if (typeof location !== "string" || !location.trim()) {
    return ""
  }

  const normalized = location.replace(/\\/g, "/").replace(/\/+$/, "")
  const leaf = normalized.split("/").filter(Boolean).pop()
  return leaf ? leaf.trim() : ""
}

export function toStringId(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim()
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

export function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry) => typeof entry === "string" && entry.trim())
    .map((entry) => entry.trim())
}

export function getPreferredLocale() {
  return safeString(
    document.documentElement?.lang,
    Array.isArray(globalThis.navigator?.languages)
      ? globalThis.navigator.languages.find(
          (entry) => typeof entry === "string" && entry.trim()
        )
      : "",
    globalThis.navigator?.language,
    "en-US"
  )
}

function getContainerFromAu(au) {
  if (!isRecord(au)) {
    return null
  }

  if (au.container) {
    return au.container
  }

  const directControllerContainer =
    au.controller?.container || au.controller?.viewModel?.container
  if (directControllerContainer) {
    return directControllerContainer
  }

  for (const value of Object.values(au)) {
    if (!isRecord(value)) {
      continue
    }

    const container =
      value.container ||
      value.controller?.container ||
      value.viewModel?.container ||
      value.controller?.viewModel?.container
    if (container) {
      return container
    }
  }

  return null
}

function getContainerFromElement(element) {
  if (!element) {
    return null
  }

  if (element.__aurelia__?.container) {
    return element.__aurelia__.container
  }

  return getContainerFromAu(element.au)
}

function getContainerFromSubtree(root) {
  if (!root) {
    return null
  }

  const rootContainer = getContainerFromElement(root)
  if (rootContainer) {
    return rootContainer
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let element = walker.nextNode()
  while (element) {
    const container = getContainerFromElement(element)
    if (container) {
      return container
    }

    element = walker.nextNode()
  }

  return null
}

function enqueueNestedValues(queue, seen, value, depth) {
  if (value instanceof Map) {
    enqueueIterable(queue, seen, value.values(), depth)
    return
  }

  if (value instanceof Set || Array.isArray(value)) {
    enqueueIterable(queue, seen, value.values(), depth)
    return
  }

  if (!isRecord(value) && typeof value !== "function") {
    return
  }

  enqueueIterable(queue, seen, Object.values(value), depth)
}

function enqueueIterable(queue, seen, values, depth) {
  for (const entry of values) {
    if ((isRecord(entry) || typeof entry === "function") && !seen.has(entry)) {
      queue.push({ value: entry, depth })
    }
  }
}
