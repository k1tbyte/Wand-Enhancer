using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using AsarSharp;
using WandEnhancer.Models;
using WandEnhancer.Utils;
using WandEnhancer.View.MainWindow;

namespace WandEnhancer.Core
{
    public class Enhancer
    {
        private const string ResourcesDirectoryName = "resources";
        private const string AppAsarFileName = "app.asar";
        private const string AppAsarUnpackedDirectoryName = "app.asar.unpacked";
        private const string AppAsarBackupFileName = "app.asar.backup";
        private const string AppAsarUnpackedBackupDirectoryName = "app.asar.unpacked.backup";
        private const string ProxyDllFileName = "version.dll";
        private const string StubBackupSuffix = ".stub";
        private const string WebPanelDirectoryName = "web-panel";
        private const string WebPanelDistDirectoryName = "dist";
        private const string LocalCustomScriptsDirectoryName = "renderer-scripts";
        private const string RemotePanelDirectoryName = "remote-panel";
        private const string RemoteBridgeTargetFileName = "bridge.cjs";
        private const string RemoteRendererScriptsDirectoryName = "renderer-scripts";
        private const string EmbeddedRemotePanelDistPrefix = "remote-panel/dist/";
        private const string AppBundleFilePrefix = "app-";
        private const string AppBundleFileSuffix = ".bundle.js";
        private const string IndexBundleFileName = "index.js";
        private const string JavaScriptFileSearchPattern = "*.js";
        private const string DuplicateScriptSuffix = ".custom";
        private const int FirstDuplicateScriptIndex = 1;

        private readonly WeModConfig _weModConfig;
        private readonly Action<string, ELogType> _logger;
        private readonly PatchConfig _config;
        private readonly JavaScriptPatchApplier _jsPatchApplier;
        private readonly string _asarPath;
        private readonly string _backupPath;
        private readonly string _unpackedPath;
        private readonly string _unpackedBackupPath;

        /// <summary>For <see cref="Restore"/>, which needs the install paths but no patch selection.</summary>
        public Enhancer(WeModConfig weModConfig, Action<string, ELogType> logger)
            : this(weModConfig, logger, null)
        {
        }

        public Enhancer(WeModConfig weModConfig, Action<string, ELogType> logger, PatchConfig config)
        {
            _weModConfig = weModConfig;
            _logger = logger;
            _config = config;
            _jsPatchApplier = new JavaScriptPatchApplier(logger);

            _asarPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarFileName);
            _unpackedPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarUnpackedDirectoryName);
            _backupPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarBackupFileName);
            _unpackedBackupPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarUnpackedBackupDirectoryName);
        }

        /// <summary>
        /// Both halves of the backup must exist. Accepting either one on its own reported a
        /// half-written backup as patched, which blocked patching while <see cref="Restore"/>
        /// refused to run - leaving the user with no way forward.
        /// </summary>
        public static bool IsPatched(string rootDirectory)
        {
            var resources = Path.Combine(rootDirectory, ResourcesDirectoryName);
            return File.Exists(Path.Combine(resources, AppAsarBackupFileName))
                   && Directory.Exists(Path.Combine(resources, AppAsarUnpackedBackupDirectoryName));
        }

        private void PatchAsar()
        {
            var items = Directory.EnumerateFiles(_unpackedPath, JavaScriptFileSearchPattern, SearchOption.TopDirectoryOnly)
                .Where(IsCandidateBundleFile)
                .ToList();

            if (!items.Any())
            {
                throw new Exception("[ENHANCER] No app bundle found");
            }

            var remainingPatches = new HashSet<EPatchType>(_config.PatchTypes);
            var enhancerConfig = EnhancerConfig.GetInstance();

            foreach (var item in items)
            {
                if (remainingPatches.Count == 0)
                {
                    break;
                }

                if (!CouldFileContainRemainingPatch(item, remainingPatches, enhancerConfig))
                {
                    continue;
                }

                string data = File.ReadAllText(item);
                bool fileChanged = false;

                foreach (var entry in remainingPatches.ToList())
                {
                    var entries = enhancerConfig[entry];
                    foreach (var patchEntry in entries)
                    {
                        bool patchApplied;
                        data = _jsPatchApplier.Apply(item, data, patchEntry, entry, out patchApplied);
                        fileChanged = fileChanged || patchApplied;
                    }

                    // Optional patches stay in the scan until every file has been checked, because
                    // their capability may still show up in a bundle we have not read yet.
                    if (entries.All(x => x.Applied))
                    {
                        remainingPatches.Remove(entry);
                    }
                }

                if (fileChanged)
                {
                    File.WriteAllText(item, data);
                }
            }

            ReportUnappliedPatches(remainingPatches, enhancerConfig);
        }

        private void ReportUnappliedPatches(IEnumerable<EPatchType> remainingPatches, Dictionary<EPatchType, EnhancerConfig.PatchEntry[]> enhancerConfig)
        {
            var unapplied = remainingPatches
                .SelectMany(patchType => enhancerConfig[patchType]
                    .Where(patch => !patch.Applied)
                    .Select(patch => new { Label = JavaScriptPatchApplier.FormatLabel(patchType, patch), Patch = patch }))
                .ToList();

            foreach (var skipped in unapplied.Where(entry => entry.Patch.IsResolved))
            {
                _logger($"[ENHANCER] [{skipped.Label}] Capability not present, skipping", ELogType.Info);
            }

            var failed = unapplied.Where(entry => !entry.Patch.IsResolved).Select(entry => entry.Label).ToList();
            if (failed.Count > 0)
            {
                throw new Exception($"[ENHANCER] Failed to apply patches: {string.Join(", ", failed)}. The version may not be supported.");
            }
        }

        private static bool IsCandidateBundleFile(string filePath)
        {
            string fileName = Path.GetFileName(filePath);
            return fileName.Equals(IndexBundleFileName, StringComparison.OrdinalIgnoreCase)
                || (fileName.StartsWith(AppBundleFilePrefix, StringComparison.OrdinalIgnoreCase)
                    && fileName.EndsWith(AppBundleFileSuffix, StringComparison.OrdinalIgnoreCase));
        }

        private static bool CouldFileContainRemainingPatch(string filePath, IEnumerable<EPatchType> remainingPatches, Dictionary<EPatchType, EnhancerConfig.PatchEntry[]> enhancerConfig)
        {
            return remainingPatches
                .SelectMany(patchType => enhancerConfig[patchType])
                .Any(patchEntry => !patchEntry.Applied && JavaScriptPatchApplier.CanSearchFile(filePath, patchEntry));
        }

        private static string FindWorkspacePath(params string[] segments)
        {
            string current = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            while (!string.IsNullOrEmpty(current))
            {
                string candidate = Path.Combine(new[] { current }.Concat(segments).ToArray());
                if (Directory.Exists(candidate) || File.Exists(candidate))
                {
                    return candidate;
                }

                current = Directory.GetParent(current)?.FullName;
            }

            throw new FileNotFoundException($"Required workspace artifact not found: {Path.Combine(segments)}");
        }

        private static int CopyJavaScriptFiles(string sourceDir, string destinationDir)
        {
            if (string.IsNullOrEmpty(sourceDir) || !Directory.Exists(sourceDir))
            {
                return 0;
            }

            return CopySelectedJavaScriptFiles(
                Directory.GetFiles(sourceDir, JavaScriptFileSearchPattern, SearchOption.TopDirectoryOnly),
                destinationDir);
        }

        private static string GetAvailableScriptPath(string destinationDir, string fileName)
        {
            string destinationPath = Path.Combine(destinationDir, fileName);
            if (!File.Exists(destinationPath))
            {
                return destinationPath;
            }

            string name = Path.GetFileNameWithoutExtension(fileName);
            string extension = Path.GetExtension(fileName);
            for (int index = FirstDuplicateScriptIndex; ; index++)
            {
                destinationPath = Path.Combine(destinationDir, $"{name}{DuplicateScriptSuffix}{index}{extension}");
                if (!File.Exists(destinationPath))
                {
                    return destinationPath;
                }
            }
        }

        private static int CopyEmbeddedDirectory(string resourcePrefix, string destinationDir)
        {
            var assembly = Assembly.GetExecutingAssembly();
            var resourceNames = assembly.GetManifestResourceNames()
                .Where(name => name.StartsWith(resourcePrefix, StringComparison.Ordinal))
                .ToList();

            if (resourceNames.Count == 0)
            {
                return 0;
            }

            Directory.CreateDirectory(destinationDir);

            foreach (var resourceName in resourceNames)
            {
                var relativePath = resourceName.Substring(resourcePrefix.Length)
                    .Replace('/', Path.DirectorySeparatorChar)
                    .Replace('\\', Path.DirectorySeparatorChar);
                var destinationPath = Path.Combine(destinationDir, relativePath);
                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath) ?? destinationDir);

                using (var resource = assembly.GetManifestResourceStream(resourceName))
                {
                    if (resource == null)
                    {
                        throw new FileNotFoundException($"Embedded resource not found: {resourceName}");
                    }

                    using (var output = File.Create(destinationPath))
                    {
                        resource.CopyTo(output);
                    }
                }
            }

            return resourceNames.Count;
        }

        private static string FindLocalCustomScriptsPath()
        {
            string executableDirectory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (string.IsNullOrEmpty(executableDirectory))
            {
                return null;
            }

            string localScripts = Path.Combine(executableDirectory, LocalCustomScriptsDirectoryName);
            return Directory.Exists(localScripts) ? localScripts : null;
        }

        private static int CopySelectedJavaScriptFiles(IEnumerable<string> files, string destinationDir)
        {
            if (files == null)
            {
                return 0;
            }

            Directory.CreateDirectory(destinationDir);

            int copied = 0;
            foreach (var file in files.Where(WeModInstalls.IsJavaScriptFile).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                AsarSharp.Utils.Extensions.CopyOver(file, GetAvailableScriptPath(destinationDir, Path.GetFileName(file)));
                copied++;
            }

            return copied;
        }

        private void InjectRemotePanelFiles()
        {
            if (!_config.PatchTypes.Contains(EPatchType.RemoteWebPanelPreview))
            {
                return;
            }

            string localCustomScriptsRoot = FindLocalCustomScriptsPath();
            string targetRoot = Path.Combine(_unpackedPath, RemotePanelDirectoryName);
            string targetScriptsRoot = Path.Combine(targetRoot, RemoteRendererScriptsDirectoryName);
            string targetBridgePath = Path.Combine(targetRoot, RemoteBridgeTargetFileName);

            if (Directory.Exists(targetRoot))
            {
                Directory.Delete(targetRoot, true);
            }

            if (CopyEmbeddedDirectory(EmbeddedRemotePanelDistPrefix, targetRoot) == 0)
            {
                AsarSharp.Utils.Extensions.CopyDirectory(FindWorkspacePath(WebPanelDirectoryName, WebPanelDistDirectoryName), targetRoot);
            }

            if (!File.Exists(targetBridgePath))
            {
                throw new FileNotFoundException("[ENHANCER] Remote bridge artifact is missing. Run `cd web-panel && pnpm run build` before patching.", targetBridgePath);
            }

            int defaultScriptCount = Directory.Exists(targetScriptsRoot)
                ? Directory.GetFiles(targetScriptsRoot, JavaScriptFileSearchPattern, SearchOption.TopDirectoryOnly).Length
                : 0;
            if (defaultScriptCount == 0)
            {
                throw new FileNotFoundException("[ENHANCER] Remote renderer script artifacts are missing. Run `cd web-panel && pnpm run build` before patching.", targetScriptsRoot);
            }

            int selectedScriptCount = CopySelectedJavaScriptFiles(_config.CustomScriptPaths, targetScriptsRoot);
            int localScriptCount = CopyJavaScriptFiles(localCustomScriptsRoot, targetScriptsRoot);

            _logger($"[ENHANCER] Injected remote panel assets and renderer scripts into app.asar (default: {defaultScriptCount}, selected: {selectedScriptCount}, local: {localScriptCount})", ELogType.Info);
        }

        private string SquirrelRoot
        {
            get
            {
                string root = Directory.GetParent(_weModConfig.RootDirectory)?.FullName;
                if (string.IsNullOrEmpty(root))
                {
                    throw new Exception("[ENHANCER] Cannot determine Squirrel root directory");
                }

                return root;
            }
        }

        private void DeployLauncher()
        {
            string stubPath = Path.Combine(SquirrelRoot, _weModConfig.ExecutableName);
            string stubBackup = stubPath + StubBackupSuffix;
            string self = Assembly.GetExecutingAssembly().Location;

            // Auto-patch runs from inside the deployed launcher: it cannot overwrite its own
            // running image, and does not need to - it is already in place.
            if (string.Equals(self, stubPath, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            if (File.Exists(stubPath) && !File.Exists(stubBackup))
            {
                AsarSharp.Utils.Extensions.CopyOver(stubPath, stubBackup);
            }

            AsarSharp.Utils.Extensions.CopyOver(self, stubPath);
            _logger("[ENHANCER] Launcher deployed to root directory", ELogType.Info);
        }

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

        /// <summary>Reads the patch selection saved next to the launcher, or null when absent or unreadable.</summary>
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

        public void Patch()
        {
            ProcessTerminator.TryKillProcess(_weModConfig.BrandName);
            if (!File.Exists(_backupPath))
            {
                _logger("[ENHANCER] Creating backup...", ELogType.Info);
                AsarSharp.Utils.Extensions.CopyOver(_asarPath, _backupPath);
            }
            else
            {
                _logger("[ENHANCER] Backup found, restoring pristine app.asar before patching...", ELogType.Info);
                AsarSharp.Utils.Extensions.CopyOver(_backupPath, _asarPath);
            }

            if (!Directory.Exists(_unpackedBackupPath) && Directory.Exists(_unpackedPath))
            {
                _logger("[ENHANCER] Creating backup of app.asar.unpacked...", ELogType.Info);
                AsarSharp.Utils.Extensions.CopyDirectory(_unpackedPath, _unpackedBackupPath);
            }
            else if (Directory.Exists(_unpackedBackupPath))
            {
                _logger("[ENHANCER] Restoring pristine app.asar.unpacked before patching...", ELogType.Info);
                if (Directory.Exists(_unpackedPath))
                {
                    Directory.Delete(_unpackedPath, true);
                }

                AsarSharp.Utils.Extensions.CopyDirectory(_unpackedBackupPath, _unpackedPath);
            }
            else if (!Directory.Exists(_unpackedPath))
            {
                throw new Exception("[ENHANCER] app.asar.unpacked is missing and no backup exists. Restore the original Wand installation files or reinstall Wand, then patch again.");
            }

            if (!File.Exists(_asarPath))
            {
                throw new Exception("app.asar not found");
            }

            // Everything past this point mutates the installation. A half-applied patch does
            // not boot - the fuse is only cleared by the deployed launcher, so a patched
            // app.asar without it dies with -36861 - so failure has to put the files back.
            try
            {
                ExtractSources();
                PatchAsar();
                InjectRemotePanelFiles();
                PackSources();
                DeployLauncher();
            }
            catch
            {
                RollbackQuietly();
                throw;
            }

            // enhancer.json only exists to drive auto-patch. Without it the launcher still
            // runs Wand (fuse patch only), so drop it when the user opts out.
            if (_config.AutoApplyAfterUpdate)
            {
                SaveAutoPatchConfig();
            }
            else
            {
                DeleteAutoPatchConfig();
            }

            _logger("[ENHANCER] Done!", ELogType.Success);
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

        /// <summary>
        /// Best-effort restore after a failed patch. Never throws: the caller is already
        /// propagating the real failure and it must not be replaced by a cleanup error.
        /// </summary>
        private void RollbackQuietly()
        {
            try
            {
                if (File.Exists(_backupPath))
                {
                    AsarSharp.Utils.Extensions.CopyOver(_backupPath, _asarPath);
                }

                if (Directory.Exists(_unpackedBackupPath))
                {
                    if (Directory.Exists(_unpackedPath))
                    {
                        Directory.Delete(_unpackedPath, true);
                    }

                    AsarSharp.Utils.Extensions.CopyDirectory(_unpackedBackupPath, _unpackedPath);
                }

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

            ProcessTerminator.TryKillProcess(_weModConfig.BrandName);
            AsarSharp.Utils.Extensions.CopyOver(_backupPath, _asarPath);

            if (Directory.Exists(_unpackedPath))
            {
                Directory.Delete(_unpackedPath, true);
            }

            AsarSharp.Utils.Extensions.CopyDirectory(_unpackedBackupPath, _unpackedPath);

            // Clean up legacy proxy DLL
            var proxyDllPath = Path.Combine(_weModConfig.RootDirectory, ProxyDllFileName);
            if (File.Exists(proxyDllPath))
            {
                File.Delete(proxyDllPath);
            }

            // Restore original Squirrel stub and drop the auto-patch config
            string squirrelRoot = SquirrelRoot;
            string stubPath = Path.Combine(squirrelRoot, _weModConfig.ExecutableName);
            string stubBackup = stubPath + StubBackupSuffix;
            if (File.Exists(stubBackup))
            {
                AsarSharp.Utils.Extensions.CopyOver(stubBackup, stubPath);
                File.Delete(stubBackup);
            }

            foreach (var leftover in new[] { Constants.AutoPatchConfigFileName, LauncherLog.FileName })
            {
                string path = Path.Combine(squirrelRoot, leftover);
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }

            File.Delete(_backupPath);
            Directory.Delete(_unpackedBackupPath, true);
            _logger("[ENHANCER] Backup restored successfully.", ELogType.Success);
        }
    }
}
