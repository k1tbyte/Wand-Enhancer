# Fork Code Review — 2026-06-28

Multi-AI review (ChatGPT GPT-4o, Grok-3, Perplexity Sonar, Gemini 2.5 Pro) of the full C# source.
Findings are grouped by severity. Each entry includes the file, the problem, and the concrete fix.

> **Fork-only file — not part of upstream.** Gets preserved across `merge-upstream` syncs because
> upstream doesn't have a `docs/` directory.

---

## Critical

### C1 — `TryKillProcess` loop never exits early (`Common.cs`)

**All 4 AIs flagged this.**

The condition `processes.Length > i || i < 5` guarantees 5 full iterations regardless of whether
WeMod died on the first attempt. It also never calls `Dispose()` on the `Process` objects and skips
`CloseMainWindow()` / `WaitForExit()`.

```csharp
// BEFORE (broken)
for (int i = 0; processes.Length > i || i < 5; i++)

// AFTER — exits as soon as no processes remain
public static void TryKillProcess(string processName)
{
    for (int attempt = 0; attempt < 5; attempt++)
    {
        var processes = Process.GetProcessesByName(processName);
        if (processes.Length == 0) return;

        foreach (var process in processes)
        {
            try
            {
                if (process.MainWindowHandle != IntPtr.Zero)
                {
                    process.CloseMainWindow();
                    if (!process.WaitForExit(2000))
                        process.Kill();
                }
                else
                {
                    process.Kill();
                }
                process.WaitForExit(2000);
            }
            catch { /* access denied or already exited */ }
            finally { process.Dispose(); }
        }
    }

    if (Process.GetProcessesByName(processName).Length > 0)
        throw new Exception($"Failed to terminate {processName} after 5 attempts.");
}
```

---

### C2 — Hardcoded minified private field names (`EnhancerConfig.cs`)

**`remoteBridgeBindHandler` and `remoteBridgeValueDelta` hardcode mangler-assigned names
(`#ke`, `#Ee`, `#ct`, `#Me`, `#Pe`, `#Be`) that change on every Wand bundle rebuild.**

This is the most likely reason these two patches fail after every upstream update. Every other patch in
the file uses a dynamic `Resolver` or `PatchFactory` to capture field names at runtime — these two don't.

**`remoteBridgeBindHandler` fix:**

Replace the literal `#ke`/`#Ee` in `Target` with named capture groups:

```csharp
// BEFORE — breaks on every Wand build
Target = new Regex(@"setCurrentTrainer\(e,t=null\)\{...if\(s===this\.#ke&&t===this\.#Ee\)return;"),
Patch = "...hardcoded #ke and #Ee in replacement string..."

// AFTER — captures field names dynamically
Target = new Regex(
    @"setCurrentTrainer\(e,t=null\)\{const s=e\?\.trainerId\|\|null,i=\(s\?e\?\.gameId:null\)\|\|null,n=\(s\?e\?\.supportedVersions:null\)\|\|\[];if\(s===this\.(?<trainerIdField>#\w+)&&t===this\.(?<trainerInstanceField>#\w+)\)return;"),
PatchFactory = BuildRemoteBridgeBindHandlerPatch
```

In `BuildRemoteBridgeBindHandlerPatch`:
1. Extract `match.Groups["trainerIdField"].Value` and `match.Groups["trainerInstanceField"].Value`
2. Rebuild the patch string using those values instead of the hardcoded `#ke`/`#Ee`

**`remoteBridgeValueDelta` fix:**

```csharp
// BEFORE — hardcodes #ct, #Me, #Pe, #ke, #Be
Target = new Regex(@"#ct\(e,t\)\{...this\.#Me\?\.send\(...instanceId:this\.#Pe...this\.#Be\(\)\}"),

// AFTER — captures all field names
Target = new Regex(
    @"(?<method>#\w+)\(e,t\)\{t\.push\(e\.onValueSet\(e=>\{this\.status===(?<connectedAlias>\w+)\.Connected&&e\.source!==(?<remoteAlias>[\w.]+)\.Remote&&this\.(?<channelField>#\w+)\?\.send\(""client-value-changed"",\{instanceId:this\.(?<instanceField>#\w+),name:e\.name,value:e\.value,cheatId:e\.cheatId\}\)\}\)\),this\.(?<refreshMethod>#\w+)\(\)\}"),
PatchFactory = BuildRemoteBridgeValueDeltaPatch
```

In `BuildRemoteBridgeValueDeltaPatch`, rebuild using the captured group values.
For `trainerId` (was `#ke`), use `this.__wandRemoteTrainerId` (already available in the bridge's
runtime context) rather than capturing it via C# static state.

---

## High

### H1 — `Patch()` leaves a half-written `app.asar` on repack failure (`Enhancer.cs`)

If `AsarCreator.CreatePackageWithOptions()` throws, `_asarPath` has already been opened for writing
and is corrupt. WeMod won't launch until manually restored from backup.

Fix: write the repacked archive to a temp file, then atomically replace the live path only after success.

```csharp
string tempAsar = _asarPath + ".tmp";
try
{
    AsarExtractor.ExtractAll(_asarPath, _unpackedPath);
    PatchAsar();
    InjectRemotePanelFiles();

    new AsarCreator(_unpackedPath, tempAsar, new CreateOptions
    {
        Unpack = new Regex(@"^static/unpacked.*$")  // see H3
    }).CreatePackageWithOptions();

    // Only swap into place after successful repack
    File.Move(tempAsar, _asarPath, overwrite: true);
}
catch
{
    // Restore from backup so WeMod stays launchable
    if (File.Exists(_backupPath))
        File.Copy(_backupPath, _asarPath, true);
    throw;
}
finally
{
    if (File.Exists(tempAsar)) File.Delete(tempAsar);
}
```

---

### H2 — `FindLatestWeMod` sorts by `LastWriteTime` instead of semantic version (`Extensions.cs`)

Antivirus, backup tools, or Explorer browsing can update mtime on an older version folder, causing the
wrong install to be selected.

```csharp
public static WeModConfig FindLatestWeMod(string root)
{
    var appFolders = Directory.EnumerateDirectories(root)
        .Select(p => new DirectoryInfo(p))
        .Where(d => d.Name.StartsWith("app-"))
        .Select(d =>
        {
            var m = Regex.Match(d.Name, @"^app-(\d+)\.(\d+)\.(\d+)$");
            Version ver = null;
            if (m.Success)
            {
                try
                {
                    ver = new Version(
                        int.Parse(m.Groups[1].Value),
                        int.Parse(m.Groups[2].Value),
                        int.Parse(m.Groups[3].Value));
                }
                catch { /* malformed — fall back to mtime */ }
            }
            return new { Dir = d, Version = ver };
        })
        .OrderByDescending(x => x.Version ?? new Version(0, 0, 0))
        .ThenByDescending(x => x.Dir.LastWriteTime)
        .ToList();

    return appFolders
        .Select(x => CheckWeModPath(x.Dir.FullName))
        .FirstOrDefault(c => c != null);
}
```

---

### H3 — ASAR unpack regex uses backslash; ASAR paths use forward slash (`Enhancer.cs`)

```csharp
// WRONG — the pattern ^static\\unpacked.*$ never matches ASAR-internal paths
// because the ASAR format stores paths with forward slashes
new Regex(@"^static\\unpacked.*$")

// CORRECT
new Regex(@"^static/unpacked.*$")
```

---

### H4 — `AlreadyPatched` detection misses `version.dll`; restore doesn't clean stale artifacts (`MainWindowVm.cs`)

If someone deletes `app.asar.backup` manually while `version.dll` is still present, the app thinks WeMod
is unpatched and tries to patch again — writing over a possibly in-use DLL. Also, `OnBackupRestoring()`
never cleans up `app.asar.unpacked.backup`, so multiple patch cycles accumulate stale backup dirs.

```csharp
// AlreadyPatched detection — check EITHER artifact
bool hasBackup = File.Exists(Path.Combine(_weModConfig.RootDirectory, "resources", "app.asar.backup"));
bool hasProxy  = File.Exists(Path.Combine(_weModConfig.RootDirectory, "version.dll"));
if (hasBackup || hasProxy)
{
    Log("WeMod already patched. Restore backup to patch again.", ELogType.Warn);
    IsPatchEnabled = false;
    AlreadyPatched = true;
    return;
}

// OnBackupRestoring — also remove version.dll and unpacked backup
private void OnBackupRestoring(object param)
{
    string res        = Path.Combine(WeModInfo.RootDirectory, "resources");
    string backupAsar = Path.Combine(res, "app.asar.backup");
    string backupUnpk = Path.Combine(res, "app.asar.unpacked.backup");
    string proxyDll   = Path.Combine(WeModInfo.RootDirectory, "version.dll");

    if (!File.Exists(backupAsar)) { Log("Backup not found.", ELogType.Error); return; }

    try { using (File.Open(backupAsar, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { } }
    catch { Log("Backup file is locked. Close WeMod and try again.", ELogType.Error); return; }

    File.Copy(backupAsar, Path.Combine(res, "app.asar"), true);
    File.Delete(backupAsar);
    if (Directory.Exists(backupUnpk)) Directory.Delete(backupUnpk, true);
    if (File.Exists(proxyDll))        File.Delete(proxyDll);

    Log("Backup restored successfully.", ELogType.Success);
    AlreadyPatched = false;
    IsPatchEnabled = true;
}
```

---

## Medium

### M1 — `setAccountReducer` regex assumes `function` declaration syntax (`EnhancerConfig.cs`)

Current pattern: `const DECL="ACTION_SET_ACCOUNT";function FN(PARAMS){...}`

Breaks if the minifier produces:
- `const DECL="ACTION_SET_ACCOUNT",FN=function(...){...}` (combined declaration)
- Arrow function: `const DECL="ACTION_SET_ACCOUNT",FN=(a,b)=>({...})`

The `setAccountReducer` is a last-resort guard, so the impact is lower than the API patches above it.
Recommended fix: decouple detection — find the constant name first, then scan for its usage in a
`case` statement or reducer map to locate the function without assuming declaration syntax.

---

### M2 — `DisableUpdates` pattern counts parentheses literally (`EnhancerConfig.cs`)

The pattern `registerHandler("ACTION_CHECK_FOR_UPDATE".*?\)\)\)\)` counts exactly 4 closing parens.
This breaks if Wand adds or removes a wrapper function in the call chain.

Use .NET's balancing group feature to match balanced parentheses, or anchor on the statement terminator
(`;`) rather than counting parens.

---

### M3 — `DevToolsOnF12` may match multiple `whenReady().then(` sites (`EnhancerConfig.cs`)

Pattern: `(?<app>\w+)\.whenReady\(\)\.then\(` with `SingleMatch=true`.

If `index.js` contains more than one `whenReady().then(` call (common in complex Electron apps),
the patch throws. Add a unique inner anchor — e.g., require the call to be followed by a function
that contains `createWindow` or `new BrowserWindow`.

---

### M4 — `remoteBridgeReset` lookahead fragile against embedded strings (`EnhancerConfig.cs`)

The tempered greedy token `(?:(?!__wandRemoteBridge|}\s*#[\w$]+\(\)).)*?` aborts early if a
string literal or comment inside the method body contains `}` followed by a private field reference
pattern. This is a fundamental limitation of regex-vs-parser for method body extraction. The current
pattern works in practice against minified output (no comments), but worth noting for future
upstream changes.

---

## Low

### L1 — Exception swallowing hides failures

- `SettingsManager.LoadSettings()` — distinguish `JsonException` (corrupted file) from `IOException`
  (permissions) in separate catch blocks; log both
- `LocalizationManager.GetLanguageDisplayName()` — bare `catch { }` makes it impossible to tell
  whether a locale file is missing vs malformed

### L2 — Unhandled exception handler has no file logging (`Program.cs`)

`MessageBox.Show(e.ExceptionObject.ToString())` works, but users can't attach a log to bug reports.
Writing to `%TEMP%\wand-enhancer-crash.txt` before the MessageBox would be a low-effort improvement.

### L3 — `GetLanguageDisplayName` creates a `ResourceDictionary` per call (`LocalizationManager.cs`)

If called in a list (e.g., to populate a language picker), each call loads the XAML file from disk.
Cache the dictionary or pre-load display names into a `Dictionary<string, string>` once.

---

## Confirmed Non-Issues

- **`GetInstance()` creating a fresh dict each call** — intentional and correct. Fresh `PatchEntry`
  objects with `Applied=false` on every `Patch()` run. No stale state between runs.
- **`async void Execute()` in `AsyncRelayCommand`** — standard WPF ICommand pattern. The `finally`
  block correctly resets `_isExecuting`. Not a real issue.
- **`DisableTelemetry` in `EPatchType` enum (value 4)** — defined but no patch entries exist for it.
  Presumably removed or NYI. Dead enum value, not a bug.

---

## Priority Order for Implementation

| # | Fix | File | Effort |
|---|-----|------|--------|
| 1 | ASAR unpack regex `\\` → `/` | `Enhancer.cs` | 1 min |
| 2 | `TryKillProcess` loop + Dispose | `Common.cs` | 15 min |
| 3 | `AlreadyPatched` + restore cleanup | `MainWindowVm.cs` | 20 min |
| 4 | `FindLatestWeMod` semver parsing | `Extensions.cs` | 20 min |
| 5 | `Patch()` atomic temp-file pattern | `Enhancer.cs` | 30 min |
| 6 | Dynamic resolvers for `remoteBridgeBindHandler`/`ValueDelta` | `EnhancerConfig.cs` | 1-2 hr |
| 7 | `setAccountReducer` + `DisableUpdates` regex hardening | `EnhancerConfig.cs` | 1-2 hr |

Items 1 and 6 are the most likely to cause a broken patch after the next upstream Wand update.
