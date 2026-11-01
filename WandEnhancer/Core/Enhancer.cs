using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using AsarSharp;
using WandEnhancer.Core.Patching.Content;
using WandEnhancer.Core.Patching.Shared;
using WandEnhancer.Core.Patching.Strategies;
using WandEnhancer.Models;
using WandEnhancer.Utils;

namespace WandEnhancer.Core
{
    public class Enhancer
    {
        private const string ResourcesDirectoryName = "resources";
        private const string AppAsarFileName = "app.asar";
        private const string AppAsarUnpackedDirectoryName = "app.asar.unpacked";
        private const string AppAsarBackupFileName = "app.asar.backup";
        private const string AppAsarUnpackedBackupDirectoryName = "app.asar.unpacked.backup";
        private const string IncompletePatchMarkerFileName = ".incomplete-patch";
        private const string ProxyDllFileName = "version.dll";
        private const int LockedFileRetryCount = 3;
        private const int LockedFileRetryDelayMs = 500;

        private readonly WeModConfig _weModConfig;
        private readonly Action<string, ELogType> _logger;
        private readonly PatchConfig _config;
        private readonly IPatchStrategy _strategy;
        private readonly string _asarPath;
        private readonly string _backupPath;
        private readonly string _unpackedPath;
        private readonly string _unpackedBackupPath;

        /// <summary>For <see cref="Restore"/> requiring install paths but no patch selection.</summary>
        public Enhancer(WeModConfig weModConfig, Action<string, ELogType> logger)
            : this(weModConfig, logger, null)
        {
        }

        public Enhancer(WeModConfig weModConfig, Action<string, ELogType> logger, PatchConfig config)
        {
            _weModConfig = weModConfig;
            _logger = logger;
            _config = config;
            _strategy = config != null ? StrategyFactory.Create(config.Strategy) : null;

            _asarPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarFileName);
            _unpackedPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarUnpackedDirectoryName);
            _backupPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarBackupFileName);
            _unpackedBackupPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarUnpackedBackupDirectoryName);
        }

        /// <summary>Checks if both backups exist and incomplete marker is absent.</summary>
        public static bool IsPatched(string rootDirectory)
        {
            var resources = Path.Combine(rootDirectory, ResourcesDirectoryName);
            return HasBackup(rootDirectory)
                   && !File.Exists(Path.Combine(resources, IncompletePatchMarkerFileName));
        }

        public static bool HasBackup(string rootDirectory)
        {
            var resources = Path.Combine(rootDirectory, ResourcesDirectoryName);
            return File.Exists(Path.Combine(resources, AppAsarBackupFileName))
                   && Directory.Exists(Path.Combine(resources, AppAsarUnpackedBackupDirectoryName));
        }

        private string SquirrelRoot => LauncherDeployment.SquirrelRootOf(_weModConfig);

        private void SaveAutoPatchConfig()
        {
            string path = Path.Combine(SquirrelRoot, Constants.AutoPatchConfigFileName);
            File.WriteAllText(path, Newtonsoft.Json.JsonConvert.SerializeObject(_config, Newtonsoft.Json.Formatting.Indented));
        }

        private void DeleteAutoPatchConfig()
        {
            string path = Path.Combine(SquirrelRoot, Constants.AutoPatchConfigFileName);
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }

        /// <summary>Reads the patch selection saved next to the launcher, or null on failure.</summary>
        public static PatchConfig LoadAutoPatchConfig(string launcherDirectory)
        {
            try
            {
                string path = Path.Combine(launcherDirectory, Constants.AutoPatchConfigFileName);
                if (!File.Exists(path))
                {
                    return null;
                }

                return Newtonsoft.Json.JsonConvert.DeserializeObject<PatchConfig>(File.ReadAllText(path));
            }
            catch (Exception e) when (e is IOException || e is Newtonsoft.Json.JsonException || e is UnauthorizedAccessException)
            {
                return null;
            }
        }

        /// <summary>
        /// Stops everything that can hold install files open: the client, its auxiliary
        /// service, and helpers under the install root (Update.exe, crashpad, watcher).
        /// </summary>
        private void KillInstallProcesses()
        {
            ProcessTerminator.TryKillProcess(_weModConfig.BrandName);
            ProcessTerminator.TryKillProcess($"{_weModConfig.BrandName}AuxiliaryService");
            // The parent of a hand-picked folder can hold unrelated programs; only a Squirrel root is dedicated to Wand.
            bool isSquirrelRoot = File.Exists(Path.Combine(SquirrelRoot, Constants.SquirrelUpdaterFileName));
            ProcessTerminator.TryKillProcessesUnder(isSquirrelRoot ? SquirrelRoot : _weModConfig.RootDirectory);
        }

        /// <summary>Retries briefly so locks released by just-killed processes can settle.</summary>
        private static void RetryWhileLocked(Action action)
        {
            for (int attempt = 0; ; attempt++)
            {
                try
                {
                    action();
                    return;
                }
                catch (Exception e) when ((e is IOException || e is UnauthorizedAccessException) &&
                                          attempt + 1 < LockedFileRetryCount)
                {
                    Thread.Sleep(LockedFileRetryDelayMs);
                }
            }
        }

        /// <summary>Replaces app.asar.unpacked with the pristine backup, retrying transient locks.</summary>
        private void ReplaceUnpackedDirectory()
        {
            RetryWhileLocked(() =>
            {
                if (Directory.Exists(_unpackedPath))
                {
                    Directory.Delete(_unpackedPath, true);
                }

                AsarSharp.Utils.Extensions.CopyDirectory(_unpackedBackupPath, _unpackedPath);
            });
        }

        /// <summary>Explains a persistent file lock by naming whoever still has the files open.</summary>
        private Exception LockedFilesException(Exception inner)
        {
            var lockers = ProcessTerminator.FindProcessesUsing(_unpackedPath);
            string message = lockers.Count > 0
                ? $"{inner.Message} Still in use by {string.Join(", ", lockers)} - close it and try again."
                : $"{inner.Message} Another process still has these files open; close it and try again.";
            return new Exception($"[ENHANCER] {message}", inner);
        }

        private void WithLockDiagnostics(Action action)
        {
            try
            {
                action();
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                throw LockedFilesException(e);
            }
        }

        private void PrepareBackups()
        {
            if (!File.Exists(_backupPath))
            {
                _logger("[ENHANCER] Creating backup...", ELogType.Info);
                CreateBackupFile(_asarPath, _backupPath);
            }
            else
            {
                _logger("[ENHANCER] Backup found, restoring pristine app.asar before patching...", ELogType.Info);
                WithLockDiagnostics(() => RetryWhileLocked(() => AsarSharp.Utils.Extensions.CopyOver(_backupPath, _asarPath)));
            }

            if (!Directory.Exists(_unpackedBackupPath) && Directory.Exists(_unpackedPath))
            {
                _logger("[ENHANCER] Creating backup of app.asar.unpacked...", ELogType.Info);
                CreateBackupDirectory(_unpackedPath, _unpackedBackupPath);
            }
            else if (Directory.Exists(_unpackedBackupPath))
            {
                _logger("[ENHANCER] Restoring pristine app.asar.unpacked before patching...", ELogType.Info);
                WithLockDiagnostics(ReplaceUnpackedDirectory);
            }
            else if (!Directory.Exists(_unpackedPath))
            {
                throw new Exception("[ENHANCER] app.asar.unpacked is missing and no backup exists. Restore the original Wand installation files or reinstall Wand, then patch again.");
            }

            if (!File.Exists(_asarPath))
            {
                throw new Exception("app.asar not found");
            }
        }

        public void Patch()
        {
            bool hadAutoApply = File.Exists(Path.Combine(SquirrelRoot, Constants.AutoPatchConfigFileName));
            KillInstallProcesses();
            string markerPath = Path.Combine(Path.GetDirectoryName(_asarPath), IncompletePatchMarkerFileName);
            File.WriteAllText(markerPath, string.Empty);

            // Restoring the pristine files is destructive too: a lock halfway through it must roll back,
            // not leave a half-empty app.asar.unpacked. Never leave a patched archive without its launcher.
            try
            {
                PrepareBackups();

                // Start from a pristine executable to not inherit a broken signature from prior static patches.
                DiskFusePatch.Remove(_weModConfig.ExecutablePath, _logger);

                ExtractSources();
                new AsarContentPatcher(_unpackedPath, _logger, new JavaScriptPatchApplier(_logger)).Patch(_config.PatchTypes);
                new RemotePanelInjector(_unpackedPath, _logger).Inject(_config.PatchTypes, _config.CustomScriptPaths);
                PackSources();
                _strategy.ApplyEnablement(new PatchContext(_weModConfig, _logger, _unpackedPath));
                AuxiliaryCompatibility.EnsureSurvivedPatching(_unpackedBackupPath, _unpackedPath);

                // Supervised needs to intercept every start; static never does.
                if (_strategy.RequiresLauncherAlways)
                {
                    LauncherDeployment.Deploy(_weModConfig, _logger);
                }
                else
                {
                    LauncherDeployment.Restore(_weModConfig);
                }

                // Independent of the strategy: catching an update needs to run the moment Squirrel
                // writes a new version folder, not on next launch. Squirrel rewrites the root
                // execution stub as part of applying the update itself, so by the time the user
                // next starts Wand - through either strategy's own launcher interception - that
                // rewrite has already erased it. UpdateWatcherService runs independently of launch
                // timing entirely.
                if (_config.AutoApplyAfterUpdate)
                {
                    SaveAutoPatchConfig();
                    Services.WatcherAutostart.EnsureRunning(_weModConfig, _logger);
                }
                else
                {
                    DeleteAutoPatchConfig();
                    Services.WatcherAutostart.Stop(_weModConfig);
                }

                File.Delete(markerPath);
            }
            catch
            {
                RollbackQuietly();

                // KillInstallProcesses stopped the watcher; a failed patch must not leave a configured auto-apply dead.
                if (hadAutoApply)
                {
                    Services.WatcherAutostart.EnsureRunning(_weModConfig, _logger);
                }

                throw;
            }

            _logger("[ENHANCER] Done!", ELogType.Success);
        }

        private static void CreateBackupFile(string source, string destination)
        {
            string stagingPath = destination + ".building";
            if (File.Exists(stagingPath))
            {
                File.Delete(stagingPath);
            }

            try
            {
                AsarSharp.Utils.Extensions.CopyOver(source, stagingPath);
                File.Move(stagingPath, destination);
            }
            catch
            {
                if (File.Exists(stagingPath))
                {
                    try
                    {
                        AsarSharp.Utils.Extensions.ClearAttributes(stagingPath);
                        File.Delete(stagingPath);
                    }
                    catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
                    {
                    }
                }

                throw;
            }
        }

        private static void CreateBackupDirectory(string source, string destination)
        {
            string stagingPath = destination + ".building";
            if (Directory.Exists(stagingPath))
            {
                Directory.Delete(stagingPath, true);
            }

            try
            {
                AsarSharp.Utils.Extensions.CopyDirectory(source, stagingPath);
                Directory.Move(stagingPath, destination);
            }
            catch
            {
                if (Directory.Exists(stagingPath))
                {
                    try
                    {
                        Directory.Delete(stagingPath, true);
                    }
                    catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
                    {
                    }
                }

                throw;
            }
        }

        private void ExtractSources()
        {
            try
            {
                _logger("[ENHANCER] Extracting app.asar...", ELogType.Info);
                AsarExtractor.ExtractAll(_asarPath, _unpackedPath);
            }
            catch (Exception e)
            {
                throw new Exception($"[ENHANCER] Failed to unpack app.asar: {e.Message}", e);
            }
        }

        private void PackSources()
        {
            try
            {
                new AsarCreator(_unpackedPath, _asarPath, new CreateOptions
                {
                    Unpack = new Regex(@"^static\\unpacked.*$")
                }).CreatePackageWithOptions();
            }
            catch (Exception e)
            {
                throw new Exception($"[ENHANCER] Failed to pack app.asar: {e.Message}", e);
            }
        }

        /// <summary>Best-effort restore after failed patch. Does not throw.</summary>
        private void RollbackQuietly()
        {
            try
            {
                if (File.Exists(_backupPath))
                {
                    RetryWhileLocked(() => AsarSharp.Utils.Extensions.CopyOver(_backupPath, _asarPath));
                }

                if (Directory.Exists(_unpackedBackupPath))
                {
                    ReplaceUnpackedDirectory();
                }

                // Undo on-disk fuse and launcher deployment to prevent a tampered unlaunchable Wand.
                LauncherDeployment.Restore(_weModConfig);
                DiskFusePatch.Remove(_weModConfig.ExecutablePath, _logger);

                _logger("[ENHANCER] Patch failed - the original Wand files were restored.", ELogType.Warn);
            }
            catch (Exception e)
            {
                _logger($"[ENHANCER] Patch failed and the rollback did not finish: {e.Message}. " +
                        "Use Restore before launching Wand.", ELogType.Error);
            }
        }

        public void Restore()
        {
            if (!File.Exists(_backupPath) || !Directory.Exists(_unpackedBackupPath))
            {
                throw new Exception("[ENHANCER] Backup is incomplete. Restore the original Wand installation files or reinstall Wand.");
            }

            // The watcher runs from the install root; stop it before it can re-patch mid-restore.
            Services.WatcherAutostart.Stop(_weModConfig);
            KillInstallProcesses();

            WithLockDiagnostics(() =>
            {
                RetryWhileLocked(() => AsarSharp.Utils.Extensions.CopyOver(_backupPath, _asarPath));
                ReplaceUnpackedDirectory();
            });

            // Clean up legacy proxy DLL
            var proxyDllPath = Path.Combine(_weModConfig.RootDirectory, ProxyDllFileName);
            if (File.Exists(proxyDllPath))
            {
                File.Delete(proxyDllPath);
            }

            // Undo all footprints at once: launcher stub, on-disk fuse.
            LauncherDeployment.Restore(_weModConfig);
            DiskFusePatch.Remove(_weModConfig.ExecutablePath, _logger);

            // launcher.log stays: bug reports ask for it and Restore is what users run right after a failure.
            DeleteAutoPatchConfig();

            string markerPath = Path.Combine(Path.GetDirectoryName(_asarPath), IncompletePatchMarkerFileName);
            if (File.Exists(markerPath))
            {
                File.Delete(markerPath);
            }

            File.Delete(_backupPath);
            Directory.Delete(_unpackedBackupPath, true);
            _logger("[ENHANCER] Backup restored successfully.", ELogType.Success);
        }
    }
}
