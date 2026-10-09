using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security;
using System.Threading;
using Microsoft.Win32;
using WandEnhancer.Core.Patching.Shared;
using WandEnhancer.Models;

namespace WandEnhancer.Core.Services
{
    /// <summary>
    /// Deploys a copy of this exe as a background update watcher, registers it to start at
    /// logon, and starts it immediately so an update is caught without waiting for a reboot.
    /// </summary>
    internal static class WatcherAutostart
    {
        private const string WatcherFileName = "WandEnhancerWatcher.exe";
        private const string RunValueNamePrefix = "WandEnhancerWatcher_";
        private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";

        private static readonly string OwnImagePath = Assembly.GetExecutingAssembly().Location;

        public static void EnsureRunning(WeModConfig install, Action<string, ELogType> log)
        {
            string squirrelRoot;
            try
            {
                squirrelRoot = LauncherDeployment.SquirrelRootOf(install);
            }
            catch (Exception e)
            {
                log?.Invoke($"[ENHANCER] Could not set up the background update watcher: {e.Message}", ELogType.Warn);
                return;
            }

            if (Mutex.TryOpenExisting(UpdateWatcherService.MutexName(squirrelRoot), out Mutex existing))
            {
                existing.Dispose();
                log?.Invoke("[ENHANCER] Update watcher is already running.", ELogType.Info);
                return;
            }

            try
            {
                string watcherPath = Path.Combine(squirrelRoot, WatcherFileName);

                // Skip overwriting self if this process IS the watcher being (re)started.
                if (!string.Equals(OwnImagePath, watcherPath, StringComparison.OrdinalIgnoreCase))
                {
                    AsarSharp.Utils.Extensions.CopyOver(OwnImagePath, watcherPath);
                }

                RegisterRunKey(install, watcherPath, squirrelRoot);
                StartDetached(watcherPath, squirrelRoot);
                log?.Invoke("[ENHANCER] Update watcher installed and running in the background.", ELogType.Info);
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is SecurityException)
            {
                log?.Invoke($"[ENHANCER] Could not set up the background update watcher: {e.Message}", ELogType.Warn);
            }
        }

        public static void Stop(WeModConfig install)
        {
            try
            {
                string squirrelRoot = LauncherDeployment.SquirrelRootOf(install);
                UnregisterRunKey(install);
                UpdateWatcherService.Stop(squirrelRoot);
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is SecurityException)
            {
                // Best-effort: nothing left to clean up if the registry/root can't be reached.
            }
        }

        private static void RegisterRunKey(WeModConfig install, string watcherPath, string squirrelRoot)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKeyPath))
            {
                key?.SetValue(ValueName(install), $"\"{watcherPath}\" --watch-updates \"{squirrelRoot}\"");
            }
        }

        private static void UnregisterRunKey(WeModConfig install)
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true))
            {
                key?.DeleteValue(ValueName(install), throwOnMissingValue: false);
            }
        }

        private static string ValueName(WeModConfig install) => RunValueNamePrefix + install.BrandName;

        private static void StartDetached(string watcherPath, string squirrelRoot)
        {
            Process.Start(new ProcessStartInfo(watcherPath, $"--watch-updates \"{squirrelRoot}\"")
            {
                UseShellExecute = false,
                WorkingDirectory = Path.GetDirectoryName(watcherPath),
                WindowStyle = ProcessWindowStyle.Hidden,
                CreateNoWindow = true
            })?.Dispose();
        }
    }
}
