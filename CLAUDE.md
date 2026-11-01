# Wand Enhancer

WPF (.NET Framework 4.8) tool that patches the Wand Electron app's `app.asar`, plus an embedded mobile Remote Web Panel (`web-panel/`, Preact and Vite). Keep changes narrow and preserve the patch pipeline invariants. README.md owns user docs, CONTRIBUTING.md the release process.

## Commands

- `build.cmd` (`build.ps1 -Configuration Release`) - the full gate: panel lint, typecheck, build and Vitest, WPF build, desktop state and patch locator checks. Run it after any code change. It uses temporary fixtures and never touches a real Wand install.
- `cd web-panel; pnpm run build` - panel only: typecheck, Vite, bridge bundle, `verify:dist`
- `cd web-panel; pnpm exec vitest run <file>` - one web test
- `build.cmd -EnableUpdateNotifications` - the opt-in update-check variant

## Rules

`.claude/rules/` holds the working rules. Claude Code loads each one when you touch a file matching its `paths`; other agents read the ones that match the files in their task.

| Rule | Covers |
|---|---|
| `patch-engine.md` | structural JS patches, `PatchEntry`, payload scripts, Pro and DevTools patches (`Core/EnhancerConfig.cs`, `Core/Js/**`, `Patches/*.js`) |
| `asar-pipeline.md` | `Enhancer.Patch()` rollback, backups, auxiliary service integrity gate, ASAR extraction (`Core/Patching/**`, `AsarSharp/**`) |
| `auto-apply.md` | update watcher, Squirrel update detection, launcher deployment, `launcher.log` (`Core/Services/**`, `Program.cs`) |
| `update-notifications.md` | compile-time opt-in GitHub release check |
| `remote-bridge.md` | Electron bridge, renderer scripts, websocket protocol (`web-panel/bridge/**`, `web-panel/protocol/**`) |
| `web-panel.md` | panel size and dist limits, storage, enums, controls, haptics, drawer performance (`web-panel/src/**`) |
| `testing.md` | test harnesses and what they may touch (`scripts/**`, `*.test.ts`) |

Rules describe the code as it is. A change that adds, renames or retires a mechanism, convention or path updates every rule that names it, in the same commit: grep `.claude/` for the old name before finishing. `web-panel/scripts/docs-refs.test.ts` fails when a rule names a path that no longer exists.

## Comments

Explain only a non-obvious reason, invariant, compatibility constraint or operational quirk, in 1-2 lines. Never narrate names, types or the code below. Use `-`, not a long dash.
