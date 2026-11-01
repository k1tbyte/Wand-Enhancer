---
paths:
  - 'WandEnhancer/Core/Enhancer.cs'
  - 'WandEnhancer/Core/Patching/**'
  - 'AsarSharp/**'
  - 'scripts/tests/auxiliary-integrity.cs'
---

# ASAR patch pipeline

- Back up and restore both `resources/app.asar` and `resources/app.asar.unpacked`. Every destructive step of `Enhancer.Patch()`, including restoring the pristine files (`PrepareBackups`), stays inside the rollback `try`: a lock mid-restore otherwise leaves a half-empty `app.asar.unpacked` and an unlaunchable Wand.
- Inject `web-panel/dist` as `remote-panel`. It must already contain `bridge.cjs` and the generated default scripts under `renderer-scripts`; selected and local custom scripts are copied under `remote-panel/renderer-scripts` afterwards.
- `AsarExtractor.ExtractAll` skips unpacked entries whose source path equals the destination (in-place extraction is a self-copy that fails on locked files such as `TrainerLib_x64.dll`) and unpacked entries whose source is missing on disk (an installer removed `auxiliary/GameLauncher.exe`). Do not turn either case back into a failure.

## Auxiliary service gate

- Wand 12.61+ auxiliary services check client verification (`m_8`) before every `InjectDll` / `CreateRemoteThread` command and answer `client_integrity_failed` otherwise. `AuxiliaryCompatibility` neutralises all three inputs for both strategies (verified end to end on 12.64.1): the `WinVerifyTrust` caller, the ASAR-header status method (anchored on `resources\app.asar` + `SHA256`) and the fuse status method (anchored on the sentinel and wire error strings of the fuse reader it calls). Detach exception-handler sections when inserting an early return.
- Supervised must neutralise the signature caller too. The gate also validates the root Squirrel stub, which the deployed launcher replaces, and the unsigned launcher then fails through the live `WinVerifyTrust` path. Never Authenticode-sign the deployed launcher with a non-WeMod certificate: a wrong publisher fails the gate, while an unsigned launcher maps to `verification_error`, which passes.
- Legacy services without ASAR validation must keep working. Fail when that capability is present but unrecognisable.
- `EnsureSurvivedPatching` fails and rolls back the patch when an auxiliary service disappears.
- Test with `scripts/test-auxiliary-integrity.ps1` on copied service files, never on the live installation.
