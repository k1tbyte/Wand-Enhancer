---
paths:
  - 'WandEnhancer/Core/Services/**'
  - 'WandEnhancer/Core/LauncherLog.cs'
  - 'WandEnhancer/Core/Patching/Shared/LauncherDeployment.cs'
  - 'WandEnhancer/Program.cs'
  - 'WandEnhancer/Utils/**'
---

# Auto-apply after update

- Launcher redirection alone cannot catch an update: Squirrel rewrites the root `<Brand>.exe` stub while applying the update (`ApplyReleasesImpl: ... Rigging execution stub ...`), which erases our launcher before it runs again. So `Enhancer.Patch()` treats the two concerns separately:
  - `LauncherDeployment.Deploy` / `Restore` depend only on `_strategy.RequiresLauncherAlways` (true for Supervised, which intercepts every launch for in-memory patching).
  - `WatcherAutostart` / `UpdateWatcherService` depend only on `_config.AutoApplyAfterUpdate`, for any strategy.
- `UpdateWatcherService` is a `FileSystemWatcher` on the Squirrel root, run as a separate process (`WandEnhancer.exe --watch-updates <squirrelRoot>`, handled by `Program.TryWatchMode` before any UI). When a new `app-*` directory appears it waits for Squirrel's `Update.exe` to exit (`ProcessTerminator.IsRunningFrom`) and for the size of `resources/app.asar` to stop changing (no other reliable "done" signal), re-resolves the latest install with `WeModInstalls.FindLatestWeMod`, and re-applies the saved config (`Enhancer.LoadAutoPatchConfig`) if that install is not patched yet.
- At most one watcher runs per install: a named `Mutex` (`UpdateWatcherService.MutexName`, hashed from the root path). A named `EventWaitHandle` stops it cleanly, including a stop signalled before the watcher started.
- `WatcherAutostart` copies this exe to `<squirrelRoot>\WandEnhancerWatcher.exe`, registers an `HKCU\...\Run` entry (`WandEnhancerWatcher_<BrandName>`) and starts it immediately (`EnsureRunning`). It skips the redeploy when a watcher is already running (`Mutex.TryOpenExisting`), because overwriting a running exe is unreliable. `Stop` removes the Run entry and signals the watcher to exit.
- Kill Wand helper processes by executable path, not by name, and retry file operations that hit a lock (`ProcessTerminator.FindProcessesUsing`, `RetryWhileLocked`).
- The watcher, the deployed launcher and the manual Patch / Restore in the UI all write to the same `launcher.log` (`LauncherLog.Open` at the Squirrel root). Restore must keep `launcher.log` and `launcher.prev.log`.
