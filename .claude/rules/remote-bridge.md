---
paths:
  - 'web-panel/bridge/**'
  - 'web-panel/protocol/**'
  - 'WandEnhancer/Patches/remote-bridge-*.js'
---

# Remote bridge and renderer scripts

- The default port is `3223`. Keep bridge and frontend constants aligned; C# must not duplicate the presentation URL or port.
- Shared protocol version, port and HTTP/WS paths live in `web-panel/protocol/web-contract.json`. Bridge-only IPC channels, WS opcodes and renderer injection delays live in `web-panel/bridge/src/constants.ts`. Never redeclare them inline.
- The protocol never carries the Wand bearer token or installation paths.
- The bridge is TypeScript under `web-panel/bridge/src/`, bundled and minified into `web-panel/dist/bridge.cjs` by `pnpm run build:bridge`. Never copy bridge source into Wand or embed it as ASAR resources.
- Default renderer script sources are in `web-panel/bridge/scripts/default/` and are bundled into `web-panel/dist/renderer-scripts/` by the same step. Custom scripts come from the patch dialog (`PatchConfig.CustomScriptPaths`, existing `.js` files only). A `renderer-scripts` folder next to the patcher exe is an advanced fallback.

## Remote popup cleanup

- `remote-popup-cleanup.js` redirects the remote tooltip links and every rendered `remote-qr-code`. It reuses Wand's loaded QR renderer through the webpack runtime, keeps the local URL visible as a fallback and hides the Pro onboarding mobile app card.
- Do not add C# ASAR patches for the tooltip URL or the QR component: a changed UI bundle must not fail the whole remote-panel patch.

## Installed apps and game status

- `installed-apps-sync.js` publishes `My Games` snapshots over `wand-remote-installed-apps` and mirrors Wand's `my_games` criteria: catalog games come from `installedGameVersions`, extra installed unsupported titles from `correlatedUnavailableTitles` whose `games[].correlationIds` match `installedApps`. When the store slice is empty, fall back to Wand's `/v3/unavailable_titles` lookup through the renderer API client, never to raw install entries or an empty list.
- Artwork `imageUrl`, in order: Wand's icon CDN `https://api-cdn.wemod.com/steam_community/<steamAppId>/client_icon/96.webp` whenever the matched title, game or version metadata holds a Steam AppID (search nested `steam*` metadata, it is not a flat property, on any install platform); the installed Steam `sku`; the sidebar DOM (`.sidebar-game-row-image` background, keyed by the `titleId` in `data-tooltip-trigger-for`). The panel's `GameCover` tolerates broken URLs and falls back to a text cover.
- Lifecycle goes through `wand-remote-game-status`: `game-launched` / `game-ended` from Wand's launch monitor, trainer runtime from the running-trainer visibility service. The panel reads it as the `game_status` websocket message. When a trainer is active but Wand emitted no `game-launched`, synthesize a running session from the visibility payload so the panel does not show an idle game next to a running trainer.
- The websocket `hello` snapshot always sends the cached `installed_apps` and `game_status`, even before any trainer snapshot. Never return early after `trainer_changed`.

## Remote Play / Stop

- The panel sends the websocket `remote_command` message. The bridge forwards it over `wand-remote-command` / `wand-remote-command-response`, and `installed-apps-sync.js` resolves Wand's trainer API and trainer service to launch a trainer for a `gameId` or end the current one.
- Play must construct Wand's real trainer launch request class (`69482.vO`) before `trainerService.launch(...)`. A plain object still launches the game but breaks the `getMetadata(vO)` trainer state: status goes missing, the play and close buttons disappear, loading sticks.
