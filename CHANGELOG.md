# Changelog

This file is the source of truth for release notes.
The newest entry must match the version in `WandEnhancer/Properties/AssemblyInfo.cs`.

## [2.1.0.0] - 2026-09-09

### Features

- **New fixed static patch method, now the default.** It applies the patch on disk, which is more stable for most users than the runtime approach - so it is the default now. A *Patch method* selector at the top of the patch dialog switches between it and the in-memory *Supervised* method, with an info note on the trade-off.
- The deployed launcher now wears Wand's own icon, so replaced shortcuts look unchanged.

### Improvements

- *Auto-apply after updates* is off by default.

## [2.0.0.1] - 2026-09-07

### Fixes

- Fixed Wand opening to a black window that only Task Manager could close, and every further click on the shortcut landing in the same place. Electron runs one Wand at a time, so each new launch was handed straight to the instance already holding that window - an instance no launcher is watching, whose windows can never come back. The launcher now recognises the handover and says what to close. #214 #272 #276 #286
- Fixed the patch missing processes the launcher is not allowed to look inside. Windows gives an executable one address for as long as the machine is up, so the launcher now takes that address from the process it starts itself instead of asking each new child for it at the moment the child is most guarded. Antivirus software that filters access to a running process was enough to leave one renderer unpatched, and an unpatched renderer is the black window. #214 #283
- Fixed Wand installed in a path longer than 260 characters having its processes ignored and left to fail the integrity check.

### Improvements

- A process the patch could not reach now says what stopped it: that the process was still being created, or that reading it was refused, and which error said so - in the words Windows itself uses, not a bare number to look up. Those were one message before and they call for opposite answers: the first is a moment's wait, the second is something on the machine standing in the way. #283
- Wand marked *Run as administrator* is now reported as exactly that, instead of a bare Windows error number.
- "No Wand install found" now reaches the window that opens because of it.

## [2.0.0.0] - 2026-09-05

### Important

- The bundled `version.dll` proxy is gone. The launcher now starts Wand and keeps the patch applied in every process Electron spawns, for as long as Wand runs. This is what fixes Wand refusing to launch after enhancing on related issues: #207 #210 #211 #213 #214 #217
- The native helper and its CMake build step were removed. Building from source no longer needs `CMake` or the Visual Studio C++ workload.
- WandEnhancer now installs itself as the Wand launcher entry point, so starting Wand goes through the patcher. Restoring a backup puts the original launcher back.

### Features

- **Auto-patch after Wand updates.** Enable *Auto-apply after updates* in the patch dialog and your selection is saved next to the launcher. When Wand updates and drops the patches, the next launch re-applies them. On failure the UI opens and shows which patch broke instead of silently starting an unpatched client.
- **Rewritten patch engine with legacy version support.** Patches are located structurally instead of by regex signature: each anchors on something Wand does not rename between builds. A client rebuild that only re-minifies no longer breaks patching, and older clients keep working. #178 #186
- **Opt-in update notifications.** The manual build workflow can compile in a GitHub release check that runs when Wand starts. When compiled in, the check is on by default and can be turned off with a checkbox in Settings, with a second checkbox to also notify about pre-releases (off by default). A new release shows a native Windows notification and a badge next to the window title, and clicking either opens the release notes in the patcher (the release page when only the launcher is running). It never downloads or installs anything, and builds without the option contain none of the checker or network code. #220
- A patch whose feature is missing from your client is now reported as skipped instead of failing the whole run, and failures name the patch that broke.

### Fixes

- Fixed Remote Panel values changed in Wand desktop not syncing back to the panel. Renderer events now carry the trainer ID captured when subscribing, so late events from an old trainer are still rejected. #277
- Fixed Remote Play failing on stable Wand builds whose trainer launch module exposes fewer companion exports than beta builds.
- Fixed stopping a trainer incorrectly ending a separately monitored game session while the game was still running.
- Fixed drawer search losing keyboard focus after every keystroke.
- Fixed accidental slider changes while scrolling on a phone. Sliders now require an intentional horizontal drag and include an editable numeric value. #277
- Fixed the tile swipe-to-pin gesture stealing slider drags, and numeric inputs sending half-typed values like a lone minus sign to the trainer.
- Fixed native memory read/write byte counts using 32-bit types in the x64 launcher and process diagnostics.
- Fixed failed patches still reporting the restored installation as patched. Incomplete patch state is now tracked separately while preserving backups for retry or Restore, and Restore remains available in that state.
- Fixed the in-game overlay never appearing after enhancing, while Wand itself looked healthy. Wand creates the process that draws the overlay when a game starts, minutes or hours after launch, and only the startup processes were being covered - that one shut down the instant it opened the patched files, so nothing ever drew the overlay.
- Fixed the patch missing the processes Wand starts on slower machines, which left Wand on a black window with a dead overlay. Windows announces a process before it has finished creating it, and one attempt at that moment could arrive too early; the launcher now keeps trying for a second.
- Fixed the "Buy Pro" banner still showing after a successful patch, and Pro not activating on newer clients.
- Fixed the Enhancer closing itself when any button was pressed. #184
- A failed patch now puts your original Wand files back instead of leaving a half-patched install behind. Initial backups and packed archives are built beside their final paths and moved into place only when complete, so an interrupted copy or pack can no longer be mistaken for a valid backup or destroy `app.asar`. #221
- Fixed patching and *Restore* both failing with "Access to the path is denied" after the first successful patch. Copying carried the read-only flag from the patcher onto the launcher it installs, and then refused to overwrite what it had written - so running WandEnhancer straight out of the downloaded `.zip`, which Windows marks read-only, broke every later run. #214
- Fixed a half-written backup reporting the installation as patched, which blocked patching and restore at the same time.
- Fixed invalid ASAR integrity metadata produced from short reads, which could yield an archive the client rejects. #170
- Fixed the packer missing source size changes that happen after crawling but before the file is streamed, which could corrupt later archive offsets.
- Fixed the packer silently dropping files it could not read, for example while Wand was still running.
- Fixed archive tree lookups resolving the wrong parent and creating phantom directories in the header.
- Fixed hangs on symlink cycles and directory junctions while reading or packing an archive.
- Fixed the language switcher leaking a resource dictionary on every switch. #164
- Fixed *Restore* freezing the window while it ran.
- Fixed Squirrel install and update arguments breaking when the Windows user profile path contains spaces.
- Fixed a latent crash path from a patch type that had no configuration entry. #172
- Remote panel: fixed a blank page when the interface translations failed to load.
- Remote panel: fixed number inputs eating the decimal point while typing, and steppers drifting on fractional steps.
- Remote panel: fixed the increment control refusing to step from a value outside its option list.
- Remote panel: fixed endless two-second reconnect attempts, and reconnecting again after you disconnected on purpose.
- Remote panel: fixed installed-game updates not arriving when only the install location changed.
- Remote panel: fixed value writes silently doing nothing when the client bound to the bridge before it was ready.

### Improvements

- When Wand fails to start, the Enhancer window now opens by itself with the reason already in the log, instead of leaving you to find a log file. The same lines are still written to a `launcher.log` next to the launcher: every process Electron starts and whether the patch reached it, plus exit and crash codes. Each line now names what the process is - renderer, gpu-process, network service - and a failed attempt says what stopped it, so a log alone is enough to tell a dead overlay from a dead client. The header carries the commit the build came from and the patches that were applied, which tells two builds of one version apart and two installs of one build apart. The log now keeps one previous generation as `launcher.prev.log` instead of dropping it, so the run before a restart is still there to read.
- Log messages in the desktop app are now translated into all 12 supported languages.
- The remote panel is now usable with a keyboard and a screen reader: dialogs trap focus and close on Escape, and controls have accessible names. Pinning a mod previously required a swipe and had no keyboard path at all, so mod rows now have a pin button.

### Security and Privacy

- The panel's static file server now resolves every request inside the panel directory.
- The local bridge enforces the WebSocket framing rules required of a server (RFC 6455).
- Late trainer events naming a different trainer no longer overwrite the active trainer's values.

### Maintenance

- Builds now run web regression tests, desktop backup/rollback and native-signature checks, and structural patch fixtures in prettified and minified forms. A local harness also checks original extracted Wand bundles without changing them.
- RC branches now run CI on pushes. Bug reports request the source commit and launcher logs to distinguish candidate builds.
- Updated web dependencies within their existing major versions and moved the demo/test WebSocket package out of production dependencies.
- Shortened release-branch comments while preserving patch and launcher invariants.
- The Electron bridge is now fully type-checked; roughly 200 latent typing gaps were fixed.
- `build.ps1` and CI now run lint, type-check, and a dist verification step that syntax-checks the bundles and fails when dev-only payloads leak into a production build. CI runs on pull requests and pushes to `master`.
- Removed dead code: the `version.dll` project, an unused control and converter, and unused Pickle helpers.

## [1.0.9.4] - 2026-07-21

### Fixes

- Fixed the Remote Web Panel QR code still opening the official Wand mobile client after Wand changed its bundled QR renderer export. The renderer bridge now resolves the current export without adding a fragile C# ASAR patch. #140
- Fixed Quick Presets reporting that a preset was saved when browser local storage rejected the write. Failed writes now leave the existing preset list unchanged and show an error, and the save dialog now stays above the bottom navigation dock.
- Fixed the patcher giving up on process termination because it reused a stale process snapshot by @divya0795 in #145. Related issue: #136
- Fixed ASAR extraction path traversal and corrupt Pickle payload allocation by @divya0795 in #143.
- Fixed backup restore so `app.asar.unpacked` is restored together with `app.asar`, and the injected `version.dll` is removed after a successful restore.
- Fixed `version.dll` requiring Visual C++ runtime DLLs on some systems by statically linking the runtime. Release builds now reject accidental dynamic VCRUNTIME, MSVCP, or UCRT dependencies. #128

### Security and Privacy

- Removed bearer credentials and local installation paths from the Remote Web Panel WebSocket protocol. Trainer localization now stays inside the Electron bridge.
- Hardened the local bridge against malformed HTTP URLs, invalid Host headers, and oversized WebSocket frames, and removed the production installed-apps debug endpoint.

### Maintenance

- GitLab mirror jobs are now skipped in forks instead of failing when the upstream mirror credentials are unavailable.

## [1.0.9.3] - 2026-07-04

### Fixes

- Fixed the Remote Web Panel no longer applying on newer Wand builds and reporting "unsupported version". The remote bridge patches now resolve Wand's minified internal names dynamically instead of relying on hardcoded ones that broke on Wand updates. #118 #123 #124 #126
- Fixed Pro reverting to Free (with random sign-outs and the return of ads and the time limit) after linking a phone with Wand's mobile activation code. That native pairing triggers a server-side sign-out on a patched client, so the patcher now disables it; use the built-in Remote Web Panel to control Wand from another device instead. #120

## [1.0.9.2] - 2026-06-28

### Important

- Official releases no longer include downloadable `.exe` files. To update, sync your fork and rerun the `Build executable` workflow, or follow the instructions in [How to use](https://github.com/k1tbyte/Wand-Enhancer#-how-to-use).

### Changed

- Removed the built-in WandEnhancer updater. Official GitHub releases no longer ship executable assets.
- Removed System.Net.Http
- Removed self-signed certificate generation to prevent AV false positives.
- Switched official releases to publish release notes only.

## [1.0.9.1] - 2026-06-24

### Fixes

- Fixed Pro features disappearing after a day or two when Wand refreshed account data in the background; account store updates now preserve the patched active subscription by @Kava-4 in #110. Related issue #106
- Fixed the new Pro account reducer guard so normal account updates do not fail while keeping Pro active.

## [1.0.9.0] - 2026-06-15

### Features

- The Remote Web Panel now shows mod names, descriptions, and instructions translated to your WeMod account language by @YifePlayte in #98. Related issue: #85
- Added a language selector to the Remote Web Panel (English, Russian, German, French, Spanish, Simplified Chinese) with automatic detection from the browser language.

### Improvements

- Release builds are now code-signed, which reduces false-positive antivirus and VirusTotal detections.
- Reworked the Remote Web Panel internals around feature capabilities for easier maintenance, with no change to existing behavior.

## [1.0.8.4] - 2026-06-10

### Fixes

- Fixed QR code issues on the latest Wand version.
- Fixed application hang that occurred after Wand updates with pending patches.

## [1.0.8.3] - 2026-06-06

### Fixes

- Fixed the Remote Web Panel patches so they reliably apply on newer Wand builds by making the remote bridge patch anchors version-resilient.
- Fixed Pro activation being lost after changing the app language; the account language endpoint now keeps the patched subscription.
- Fixed "WeMod directory not found" when Wand/WeMod is installed outside the default location or only one brand folder exists. The patcher now also resolves the install directory from a running Wand/WeMod process. #82
- Hid the Pro "Remote" onboarding card in the Explore Pro benefits dialog. #86

## [1.0.8.2] - 2026-05-15

### Fixes

- Rolled back an incorrect Disable Updates patch fix that introduced a `SyntaxError` preventing Wand from launching.

## [1.0.8.1] - 2026-05-15

### Fixes

- Fixed a syntax error in the Disable Updates patch that prevented Wand from launching. #70
- Fixed an issue where the Remote Web Panel WebSocket connection wouldn't automatically reconnect when turning returning to the app or turning on the screen.
- Reduced battery consumption and device heating on mobile device by optimizing heavy UI blur effects and eliminating unnecessary React re-renders in the Remote Web Panel. #67

## [1.0.8.0] - 2026-05-06

### Features

- Added the My Games list to the Remote Panel with remote start and stop actions.
- Improved the Remote Panel with new UI and overall UX.
- Added an update dialog with release notes and access to full patch notes.

### Improvements

- Optimized and sped up patching and ASAR unpack/pack operations.

### Fixes

- Fixed in-place handling of unpacked `app.asar.unpacked` assets during packing to avoid locked-file failures.
- Fixed local network IP detection for QR-based Remote Panel pairing, so the app no longer picks Cloudflare, VMware, and similar non-LAN adapters by mistake.

## [1.0.7.0] - 2026-05-01

### Features

- New Remote Web Panel: control local app features from a phone or another PC over the local network via QR code connection. #37
- Custom Script Loader: inject and execute custom user `.js` scripts directly into the Wand renderer process via the patch modal.
- Added the ability to export and copy application logs from the UI.
- Stabilized the DevTools on `F12` patch.
- Added a repository mirror on GitLab. #47

### Fixes

- Fixed ASAR unpacking failures on locked files or missing entries. #63 #57

## [1.0.6.0] - 2025-12-14

### Fixes

- Fixed issues related to Wand `12.5.1`. #35
- Fixed a bug where the patch could not be reapplied after restoring without restarting the patcher.
- Removed the redundant telemetry removal option from patch settings.

### Features

- Added localization support.
- Added the patch option to open Wand DevTools with `F12`.

## [1.0.5.0] - 2025-11-30

### Fixes

- Fixed the issue where games detected the debugger. #33 #23 #19 #13

### Breaking Changes

- Removed patch methods.
- Removed shortcut launch.
- Removed automatic patching for new versions because it is not compatible with the current patch method.

### Notes

- This version is incompatible with previous versions of the patcher. Before updating, previous patches must be rolled back.
- With the current method, the patcher only needs to be run once to apply the patch.
- Thanks to issue #12 for sharing the patching method used here.

## [1.0.4.0] - 2025-11-05

### Features

- Added backward compatibility for older WeMod versions so both legacy WeMod and the newer Wand builds can be patched.
- Added manual version management for patches, including separate patches and shortcuts for individual WeMod or Wand versions.

## [1.0.3.0] - 2025-11-03

### Fixes

- Fixed issues related to the WeMod to Wand rebrand. #24

## [1.0.2.0] - 2025-04-09

### Fixes

- Fixed a performance issue when a process with an applied patch was scanned again.
- Fixed exception propagation into the WeMod process. #11

## [1.0.1.0] - 2025-04-01

### Fixes

- Fixed WeMod overlay breakage when using the runtime patch.

## [1.0.0.0] - 2025-03-24

### Changes

- Replaced Electron with WPF.
- Reduced the `.exe` size by more than 70x.
- Updated the UI.
- Added two types of patching.
- Fixed hotkeys breaking after patching.
- Added patch recovery.
- Removed external dependencies such as Electron and ASAR tooling from runtime.
- Added a patch option to disable WeMod updates.

### Notes

- VirusTotal detection increased with the new patching method.

## [0.0.1] - 2025-01-04

### Changes

- Basic ElectronJS wrapper over the original script.
