import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"

import { localizeTrainerSnapshot } from "./trainer-localization"

afterEach(() => vi.restoreAllMocks())

describe("trainer localization", () => {
  it("uses the bearer token only inside the bridge and returns localized metadata", async () => {
    const snapshot = rawTrainerSnapshot()
    const loadStrings = vi.fn(async (request) => {
      expect(request).toMatchObject({
        accessToken: "wand-secret",
        gameId: "game",
        gameVersion: "1.0",
        language: "de-DE",
      })
      return { cheat_name: "Unverwundbar", cheat_description: "Kein Schaden" }
    })

    const localized = await localizeTrainerSnapshot(
      snapshot,
      "wand-secret",
      loadStrings
    )

    expect(localized).not.toBe(snapshot)
    expect(localized.metadata.info.blueprint.cheats[0]).toMatchObject({
      name: "Unverwundbar",
      description: "Kein Schaden",
    })
    expect(JSON.stringify(localized)).not.toContain("wand-secret")
    expect(snapshot.metadata.info.blueprint.cheats[0].name).toBe("cheat_name")
  })

  it("deduplicates in-flight translation requests and caches successful strings", async () => {
    const https = require("node:https")
    const get = vi.spyOn(https, "get").mockImplementation((_url, _options, onResponse) => {
      const request = new EventEmitter() as any
      request.setTimeout = vi.fn()
      request.destroy = vi.fn()

      queueMicrotask(() => {
        const response = new EventEmitter() as any
        response.statusCode = 200
        response.resume = vi.fn()
        response.setEncoding = vi.fn()
        const respond = onResponse as (response: any) => void
        respond(response)
        response.emit("data", JSON.stringify({
          i18n: { strings: { cheat_name: "Cached name" } },
        }))
        response.emit("end")
      })

      return request
    })

    const snapshot = {
      ...rawTrainerSnapshot(),
      trainerInfo: { gameId: "cache-test-game" },
    }
    const pending = [
      localizeTrainerSnapshot(snapshot, "cache-test-token"),
      localizeTrainerSnapshot(snapshot, "cache-test-token"),
    ]
    const localized = await Promise.all(pending)
    const cached = await localizeTrainerSnapshot(snapshot, "cache-test-token")

    expect(get).toHaveBeenCalledTimes(1)
    expect(localized[0].metadata.info.blueprint.cheats[0].name).toBe("Cached name")
    expect(cached.metadata.info.blueprint.cheats[0].name).toBe("Cached name")
  })
})

function rawTrainerSnapshot() {
  return {
    instanceId: "instance",
    trainerId: "trainer",
    trainerInfo: { gameId: "game" },
    gameVersion: "1.0",
    language: "de-DE",
    metadata: {
      info: {
        blueprint: {
          cheats: [
            {
              target: "god",
              type: "toggle",
              name: "cheat_name",
              description: "cheat_description",
            },
          ],
        },
      },
    },
  }
}
