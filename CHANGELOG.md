# Changelog

This file is the source of truth for release notes.
The newest entry must match the version in `WandEnhancer/Properties/AssemblyInfo.cs`.

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