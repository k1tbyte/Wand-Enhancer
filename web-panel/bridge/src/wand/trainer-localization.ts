const https = require("node:https")

const WEMOD_TRAINER_ENDPOINT = "https://api.wemod.com/v3/games"
const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 5000
let cachedRequestKey = ""
let cachedStrings: Record<string, string> | null = null
let inFlightRequestKey = ""
let inFlightRequest: Promise<Record<string, string> | null> | null = null

export async function localizeTrainerSnapshot(
  rawSnapshot,
  accessToken,
  loadStrings = fetchTrainerStrings
) {
  const request = buildTrainerRequest(rawSnapshot, accessToken)
  if (!request) {
    return rawSnapshot
  }

  let strings
  try {
    strings = await loadStrings(request)
  } catch {
    return rawSnapshot
  }
  if (!strings) {
    return rawSnapshot
  }

  const info = rawSnapshot.metadata.info
  const blueprint = info.blueprint
  if (!Array.isArray(blueprint?.cheats)) {
    return rawSnapshot
  }

  return {
    ...rawSnapshot,
    metadata: {
      ...rawSnapshot.metadata,
      info: {
        ...info,
        blueprint: {
          ...blueprint,
          cheats: blueprint.cheats.map((cheat) =>
            localizeCheat(cheat, strings)
          ),
        },
      },
    },
  }
}

function buildTrainerRequest(rawSnapshot, accessToken) {
  if (!accessToken || !rawSnapshot || typeof rawSnapshot !== "object") {
    return null
  }

  const gameId = stringValue(
    rawSnapshot.trainerInfo?.gameId || rawSnapshot.metadata?.info?.gameId
  )
  if (!gameId) {
    return null
  }

  return {
    accessToken,
    gameId,
    gameVersion: stringValue(rawSnapshot.gameVersion),
    language: stringValue(rawSnapshot.language),
  }
}

function fetchTrainerStrings({ accessToken, gameId, gameVersion, language }) {
  const requestKey = [accessToken, gameId, gameVersion, language].join("\0")
  if (requestKey === cachedRequestKey) {
    return Promise.resolve(cachedStrings)
  }
  if (requestKey === inFlightRequestKey && inFlightRequest) {
    return inFlightRequest
  }

  const url = new URL(
    `${WEMOD_TRAINER_ENDPOINT}/${encodeURIComponent(gameId)}/trainer`
  )
  if (gameVersion) url.searchParams.set("gameVersions", gameVersion)
  if (language) url.searchParams.set("locale", language)

  const request = requestJson(url, accessToken)
    .then((payload) => normalizeStrings(payload?.i18n?.strings))
    .then((strings) => {
      if (strings) {
        cachedRequestKey = requestKey
        cachedStrings = strings
      }
      return strings
    })
    .finally(() => {
      if (inFlightRequestKey === requestKey) {
        inFlightRequestKey = ""
        inFlightRequest = null
      }
    })

  inFlightRequestKey = requestKey
  inFlightRequest = request
  return request
}

function requestJson(url, accessToken): Promise<any> {
  return new Promise<any>((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume()
          finish(null)
          return
        }

        let body = ""
        let receivedBytes = 0
        response.setEncoding("utf8")
        response.on("data", (chunk) => {
          receivedBytes += Buffer.byteLength(chunk)
          if (receivedBytes > RESPONSE_LIMIT_BYTES) {
            request.destroy()
            finish(null)
            return
          }
          body += chunk
        })
        response.on("end", () => {
          try {
            finish(JSON.parse(body))
          } catch {
            finish(null)
          }
        })
      }
    )

    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy())
    request.on("error", () => finish(null))
  })
}

function normalizeStrings(value): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const strings = Object.fromEntries(
    Object.entries(value).filter((entry) => typeof entry[1] === "string")
  ) as Record<string, string>
  return Object.keys(strings).length > 0 ? strings : null
}

function localizeCheat(cheat, strings) {
  if (!cheat || typeof cheat !== "object") {
    return cheat
  }

  return {
    ...cheat,
    name: translate(cheat.name, strings),
    description: translate(cheat.description, strings),
    instructions: translate(cheat.instructions, strings),
  }
}

function translate(value, strings) {
  return typeof value === "string" ? (strings[value] ?? value) : value
}

function stringValue(value) {
  return typeof value === "string" && value ? value : ""
}
