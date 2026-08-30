# Changelog

This file is the source of truth for release notes.
The newest entry must match the version in `WandEnhancer/Properties/AssemblyInfo.cs`.

## [2.0.0.0] - 2026-08-29

### Important

- The bundled `version.dll` proxy is gone. The launcher now starts Wand and keeps the patch applied in every process Electron spawns, for as long as Wand runs. This is what fixes Wand refusing to launch after enhancing on related issues: #207 #210 #211 #213 #214 #217
- The native helper and its CMake build step were removed. Building from source no longer needs `CMake` or the Visual Studio C++ workload.
- WandEnhancer now installs itself as the Wand launcher entry point, so starting Wand goes through the patcher. Restoring a backup puts the original launcher back.

### Features

- **Auto-patch after Wand updates.** Enable *Auto-apply after updates* in the patch dialog and your selection is saved next to the launcher. When Wand updates and drops the patches, the next launch re-applies them. On failure the UI opens and shows which patch broke instead of silently starting an unpatched client.
- **Rewritten patch engine with legacy version support.** Patches are located structurally instead of by regex signature: each anchors on something Wand does not rename between builds. A client rebuild that only re-minifies no longer breaks patching, and older clients keep working. #178 #186
- A patch whose feature is missing from your client is now reported as skipped instead of failing the whole run, and failures name the patch that broke.

### Fixes

- Fixed the in-game overlay never appearing after enhancing, while Wand itself looked healthy. Wand creates the process that draws the overlay when a game starts, minutes or hours after launch, and only the startup processes were being covered - that one shut down the instant it opened the patched files, so nothing ever drew the overlay.
- Fixed the "Buy Pro" banner still showing after a successful patch, and Pro not activating on newer clients.
- Fixed the Enhancer closing itself when any button was pressed. #184
- A failed patch now puts your original Wand files back instead of leaving a half-patched install behind. Packing also builds the archive beside the old one and swaps it in at the end, so a failure can no longer destroy `app.asar`. #221
- Fixed patching and *Restore* both failing with "Access to the path is denied" after the first successful patch. Copying carried the read-only flag from the patcher onto the launcher it installs, and then refused to overwrite what it had written - so running WandEnhancer straight out of the downloaded `.zip`, which Windows marks read-only, broke every later run. #214
- Fixed a half-written backup reporting the installation as patched, which blocked patching and restore at the same time.
- Fixed invalid ASAR integrity metadata produced from short reads, which could yield an archive the client rejects. #170
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

- When Wand fails to start, the Enhancer window now opens by itself with the reason already in the log, instead of leaving you to find a log file. The same lines are still written to a `launcher.log` next to the launcher: every process Electron starts and whether the patch reached it, plus exit and crash codes.
- Log messages in the desktop app are now translated into all 12 supported languages.
- The remote panel is now usable with a keyboard and a screen reader: dialogs trap focus and close on Escape, and controls have accessible names. Pinning a mod previously required a swipe and had no keyboard path at all, so mod rows now have a pin button.

### Security and Privacy

- The panel's static file server now resolves every request inside the panel directory.
- The local bridge enforces the WebSocket framing rules required of a server (RFC 6455).
- Late trainer events naming a different trainer no longer overwrite the active trainer's values.

### Maintenance

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
