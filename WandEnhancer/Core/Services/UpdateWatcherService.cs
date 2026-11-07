using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using WandEnhancer.Models;
using WandEnhancer.Utils;

namespace WandEnhancer.Core.Services
{
    /// <summary>
    /// Watches a Squirrel install root for a new version folder and re-applies the saved patch
    /// once one finishes writing and Wand is not in use. Exists because the deployed-launcher
    /// redirection (<see cref="Patching.Shared.LauncherDeployment"/>) cannot catch an update on
    /// its own: Squirrel rewrites the root execution stub as part of applying the update itself,
    /// before the user's next launch - by the time anything of ours would run again through
    /// either strategy's own launcher interception, that rewrite has already erased it.
    /// </summary>
    internal static class UpdateWatcherService
    {
        private const int SettleIntervalMs = 2000;
        private const int SettleStableReads = 3;
        private const int SettleTimeoutMs = 10 * 60 * 1000;
        private const int ClientClosedStableReads = 2;
        private const string StartInTraySwitch = "--start-in-tray";
        private static readonly TimeSpan ClientPollInterval = TimeSpan.FromSeconds(5);
        private static readonly TimeSpan TrayIdleBeforePatch = TimeSpan.FromMinutes(1);
        private static readonly TimeSpan SelfCheckInterval = TimeSpan.FromMinutes(10);

        // The startup catch-up and a Created event can target the same folder.
        private static readonly object PatchLock = new object();

        public static string MutexName(string squirrelRoot) => "Global\\WandEnhancer.Watcher." + HashOf(squirrelRoot);

        private static string StopEventName(string squirrelRoot) => "Global\\WandEnhancer.WatcherStop." + HashOf(squirrelRoot);

        /// <summary>
        /// Blocks until told to stop via <see cref="Stop"/>. Exits immediately, without touching
        /// anything, if another instance already owns this install root.
        /// </summary>
        public static void Run(string squirrelRoot, Action<string, ELogType> log)
        {
            bool owned;
            using (var mutex = new Mutex(true, MutexName(squirrelRoot), out owned))
            {
                if (!owned)
                {
                    log?.Invoke("[WATCHER] Another watcher already owns this install; exiting.", ELogType.Info);
                    return;
                }

                try
                {
                    RunOwned(squirrelRoot, log);
                }
                finally
                {
                    mutex.ReleaseMutex();
                }
            }
        }

        /// <summary>Wakes a running watcher for this root, or primes a pending stop if none is running yet.</summary>
        public static void Stop(string squirrelRoot)
        {
            using (var stop = new EventWaitHandle(false, EventResetMode.ManualReset, StopEventName(squirrelRoot)))
            {
                stop.Set();
            }
        }

        private static void RunOwned(string squirrelRoot, Action<string, ELogType> log)
        {
            using (var stop = new EventWaitHandle(false, EventResetMode.ManualReset, StopEventName(squirrelRoot)))
            using (var watcher = new FileSystemWatcher(squirrelRoot)
            {
                NotifyFilter = NotifyFilters.DirectoryName,
                IncludeSubdirectories = false
            })
            {
                watcher.Created += (sender, e) => OnEntryCreated(e, squirrelRoot, log);
                watcher.EnableRaisingEvents = true;
                log?.Invoke($"[WATCHER] Watching {squirrelRoot} for new Wand versions.", ELogType.Info);
                QueueLogged(() => CatchUp(squirrelRoot, log), log);

                // Self-check periodically as a safety net: Stop() should be the normal path, but
                // if the saved config vanished some other way (the app folder was removed by
                // hand, say) there would otherwise be nothing left to tell this to exit.
                while (!stop.WaitOne(SelfCheckInterval))
                {
                    if (!IsStillWanted(squirrelRoot))
                    {
                        log?.Invoke("[WATCHER] Auto-apply is no longer configured; exiting.", ELogType.Info);
                        return;
                    }
                }

                log?.Invoke("[WATCHER] Stop requested; exiting.", ELogType.Info);
            }
        }

        private static void OnEntryCreated(FileSystemEventArgs e, string squirrelRoot, Action<string, ELogType> log)
        {
            if (!Directory.Exists(e.FullPath) ||
                !Path.GetFileName(e.FullPath).StartsWith("app-", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            // Off the watcher thread: settling, waiting for Wand and patching can take a while and
            // must not block FileSystemWatcher from raising further events.
            QueueLogged(() =>
            {
                log?.Invoke($"[WATCHER] New version folder detected: {e.FullPath}", ELogType.Info);
                TryPatchVersion(e.FullPath, squirrelRoot, log);
            }, log);
        }

        /// <summary>
        /// Picks up a version that landed while no watcher ran, e.g. Wand was still open at shutdown.
        /// A version with backups is patched already, or an earlier attempt failed there; neither is retried.
        /// </summary>
        private static void CatchUp(string squirrelRoot, Action<string, ELogType> log)
        {
            var latest = WeModInstalls.FindLatestWeMod(squirrelRoot);
            if (latest == null || Enhancer.HasBackup(latest.RootDirectory))
            {
                return;
            }

            log?.Invoke($"[WATCHER] {latest.RootDirectory} was never patched; re-applying the saved patches.", ELogType.Info);
            TryPatchVersion(latest.RootDirectory, squirrelRoot, log);
        }

        private static void TryPatchVersion(string versionRoot, string squirrelRoot, Action<string, ELogType> log)
        {
            lock (PatchLock)
            {
                if (!WaitForSettled(versionRoot, squirrelRoot))
                {
                    log?.Invoke($"[WATCHER] Gave up waiting for {versionRoot} to finish installing.", ELogType.Warn);
                    return;
                }

                var config = ResolveTarget(versionRoot, squirrelRoot, log);
                if (config == null)
                {
                    return;
                }

                bool wasInTray = WaitUntilClientIdle(config.BrandName, squirrelRoot, log,
                    ClientPollInterval, TrayIdleBeforePatch);

                // The wait can last hours; the install may have been patched or replaced meanwhile.
                config = ResolveTarget(versionRoot, squirrelRoot, log);
                var patchConfig = config == null ? null : Enhancer.LoadAutoPatchConfig(squirrelRoot);
                if (patchConfig == null || !patchConfig.AutoApplyAfterUpdate)
                {
                    return;
                }

                try
                {
                    log?.Invoke($"[WATCHER] Re-applying patches to {config.ExecutablePath}...", ELogType.Info);
                    new Enhancer(config, log, patchConfig).Patch();
                    log?.Invoke("[WATCHER] Auto-patch after update succeeded.", ELogType.Success);
                }
                catch (Exception e)
                {
                    log?.Invoke($"[WATCHER] Auto-patch after update failed: {e.Message}", ELogType.Error);
                }
                finally
                {
                    // Patch closed it to free the files; bring it back where the user left it.
                    if (wasInTray && !ProcessTerminator.IsRunning(config.BrandName, out _))
                    {
                        RestartInTray(config, squirrelRoot, log);
                    }
                }
            }
        }

        /// <summary>The install to patch, or null with the reason logged when there is nothing to do.</summary>
        private static WeModConfig ResolveTarget(string versionRoot, string squirrelRoot, Action<string, ELogType> log)
        {
            if (!IsStillWanted(squirrelRoot))
            {
                log?.Invoke("[WATCHER] Auto-apply was turned off while waiting; skipping.", ELogType.Info);
                return null;
            }

            var config = WeModInstalls.FindLatestWeMod(squirrelRoot);
            if (config == null || !PathsEqual(config.RootDirectory, versionRoot))
            {
                log?.Invoke($"[WATCHER] {versionRoot} is not (or no longer) the latest install; skipping.", ELogType.Info);
                return null;
            }

            if (Enhancer.IsPatched(config.RootDirectory))
            {
                log?.Invoke($"[WATCHER] {versionRoot} is already patched; nothing to do.", ELogType.Info);
                return null;
            }

            return config;
        }

        /// <summary>
        /// Patching closes Wand, so this waits until it is closed, or has sat in the tray for a while
        /// with no game holding its files. Returns whether Wand was left running in the tray.
        /// </summary>
        private static bool WaitUntilClientIdle(string brandName, string squirrelRoot, Action<string, ELogType> log,
            TimeSpan pollInterval, TimeSpan trayIdle)
        {
            bool announced = false;
            int closedReads = 0;
            DateTime? hiddenSince = null;

            while (true)
            {
                if (!ProcessTerminator.IsRunning(brandName, out bool showsWindow))
                {
                    // A restart into the new version starts a fresh process within moments.
                    if (++closedReads >= ClientClosedStableReads)
                    {
                        return false;
                    }
                }
                else
                {
                    closedReads = 0;
                    if (showsWindow)
                    {
                        hiddenSince = null;
                    }
                    else if (hiddenSince == null)
                    {
                        hiddenSince = DateTime.UtcNow;
                    }
                    else if (DateTime.UtcNow - hiddenSince.Value >= trayIdle)
                    {
                        // Closing Wand to the tray does not end a game it launched with a trainer.
                        if (!ProcessTerminator.IsUsedFromOutside(squirrelRoot))
                        {
                            return true;
                        }

                        hiddenSince = DateTime.UtcNow;
                    }

                    if (!announced)
                    {
                        log?.Invoke($"[WATCHER] {brandName} is in use; the update will be patched once it is closed " +
                                    "or left in the tray.", ELogType.Info);
                        announced = true;
                    }
                }

                Thread.Sleep(pollInterval);
            }
        }

        private static void RestartInTray(WeModConfig install, string squirrelRoot, Action<string, ELogType> log)
        {
            // Through the root stub, so a Supervised launcher still clears the fuse; Wand's own update restart uses this switch.
            string stubPath = Path.Combine(squirrelRoot, install.ExecutableName);
            try
            {
                Process.Start(new ProcessStartInfo(stubPath, StartInTraySwitch)
                {
                    UseShellExecute = false,
                    WorkingDirectory = squirrelRoot
                })?.Dispose();
                log?.Invoke($"[WATCHER] Restarted {install.BrandName} in the tray.", ELogType.Info);
            }
            catch (Exception e) when (e is Win32Exception || e is InvalidOperationException || e is IOException)
            {
                log?.Invoke($"[WATCHER] Could not restart {install.BrandName}: {e.Message}", ELogType.Warn);
            }
        }

        /// <summary>An exception on a pool thread would end the watcher behind an error box; log it instead.</summary>
        private static void QueueLogged(Action work, Action<string, ELogType> log)
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    work();
                }
                catch (Exception e)
                {
                    log?.Invoke($"[WATCHER] Unexpected error: {e.Message}", ELogType.Error);
                }
            });
        }

        /// <summary>
        /// Waits for Squirrel's updater to exit, then for app.asar's size to stop changing. app.asar is
        /// written before app.asar.unpacked and the root stub, so a stable size alone can precede the end.
        /// </summary>
        private static bool WaitForSettled(string versionRoot, string squirrelRoot)
        {
            string asarPath = Path.Combine(versionRoot, "resources", "app.asar");
            string updaterPath = Path.Combine(squirrelRoot, Constants.SquirrelUpdaterFileName);
            long lastSize = -1;
            int stableReads = 0;
            DateTime deadline = DateTime.UtcNow.AddMilliseconds(SettleTimeoutMs);

            while (DateTime.UtcNow < deadline)
            {
                Thread.Sleep(SettleIntervalMs);

                if (ProcessTerminator.IsRunningFrom(updaterPath))
                {
                    stableReads = 0;
                    lastSize = -1;
                    continue;
                }

                if (!File.Exists(asarPath))
                {
                    stableReads = 0;
                    continue;
                }

                long size;
                try
                {
                    size = new FileInfo(asarPath).Length;
                }
                catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
                {
                    // Still being written to; try again next tick.
                    stableReads = 0;
                    continue;
                }

                if (size > 0 && size == lastSize)
                {
                    if (++stableReads >= SettleStableReads)
                    {
                        return true;
                    }
                }
                else
                {
                    stableReads = 0;
                }

                lastSize = size;
            }

            return false;
        }

        private static bool IsStillWanted(string squirrelRoot)
        {
            var config = Enhancer.LoadAutoPatchConfig(squirrelRoot);
            return config != null && config.AutoApplyAfterUpdate;
        }

        private static bool PathsEqual(string a, string b)
        {
            return string.Equals(
                Path.GetFullPath(a).TrimEnd('\\'),
                Path.GetFullPath(b).TrimEnd('\\'),
                StringComparison.OrdinalIgnoreCase);
        }

        private static string HashOf(string value)
        {
            using (var md5 = MD5.Create())
            {
                byte[] hash = md5.ComputeHash(Encoding.UTF8.GetBytes(value.ToLowerInvariant()));
                var builder = new StringBuilder(hash.Length * 2);
                foreach (byte b in hash)
                {
                    builder.Append(b.ToString("x2"));
                }

                return builder.ToString();
            }
        }
    }
}
