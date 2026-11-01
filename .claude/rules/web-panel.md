---
paths:
  - 'web-panel/src/**'
  - 'web-panel/vite.config.ts'
  - 'web-panel/scripts/verify-dist.mjs'
---

# Web panel

- The desktop patcher embeds the panel and injects it into Wand's `app.asar`, so it must stay small.
- Production builds contain no mock data, debug routes, sourcemaps, local fonts, heavy icon libraries or runtime class-helper packages; `web-panel/scripts/verify-dist.mjs` enforces the list. Mock and demo data is dev-only, reached through `import.meta.env.DEV` dynamic imports.
- Source uses React-compatible imports; production resolves them to Preact aliases in `web-panel/vite.config.ts`. UI is Tailwind plus the small local primitives in `web-panel/src/shared/ui/`.
- All `localStorage` access goes through `web-panel/src/shared/storage.ts` (`loadJson`, `saveJson`, `loadStringSet`, `saveStringSet`). Do not bring back per-feature `try/catch` and `JSON.parse`. Trainer and game storage IDs come from `getTrainerStorageId(trainer)` (`gameId`, then `titleId`, then `trainerId`, then `'global'`); never re-implement that precedence inline.
- Pinned cheats (`trainer/pinned-cheats/pinned-cheat-storage.ts`, key `wand-remote.pinned-cheats.v1:<gameId>`) show as a virtual `pinned` category at the top of the list; their normal category placement is kept.
- Custom presets (`trainer/presets/preset-storage.ts`, key `wand-remote.presets.v1:<gameId-or-trainerId>`) are per trainer or game and store persistent cheat values only, never `button` one-shot cheats.
- String-union types use the `E*` enum convention (`ECheatType` in `protocol/messages.ts`, `EConnectionStatus` in `remote-session/remote-session.reducer.ts`), with the wire string on the right-hand side. Reducer action tags stay discriminated-union string literals.
- Cheat input controls live one per file under `web-panel/src/trainer/controls/`. `controls/shared.tsx` holds `SliderTrack`, `StepButton` and `ControlInternalProps`, `controls/format-number.ts` the number formatting, and `controls/CheatControl.tsx` stays a thin dispatcher keyed by `ECheatType`.
- Toggle, action and stepper buttons call `hapticTap` (`shared/haptics.ts`) before dispatching. Keep it off sliders and other continuous inputs, where it would vibrate on every drag tick. It works only where the Vibration API exists (Android browsers, not iOS Safari).
- Mobile drawer performance is sensitive to `backdrop-filter`. Keep drawer panels and nested glass controls blur-free under coarse pointers, and add no per-row `backdrop-blur-*` inside drawer lists.
