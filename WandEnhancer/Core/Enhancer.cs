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
        private const string JavaScriptFileExtension = ".js";
        private const string JavaScriptFileSearchPattern = "*.js";
        private const string DuplicateScriptSuffix = ".custom";
        private const int FirstDuplicateScriptIndex = 1;

        private readonly WeModConfig _weModConfig;
        private readonly Action<string, ELogType> _logger;
        private readonly PatchConfig _config;
        private readonly string _asarPath;
        private readonly string _backupPath;
        private readonly string _unpackedPath;
        private readonly string _unpackedBackupPath;

        public Enhancer(WeModConfig weModConfig, Action<string, ELogType> logger, PatchConfig config)
        {
            _weModConfig = weModConfig;
            _logger = logger;
            _config = config;

            _asarPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarFileName);
            _unpackedPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarUnpackedDirectoryName);
            _backupPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarBackupFileName);
            _unpackedBackupPath = Path.Combine(weModConfig.RootDirectory, ResourcesDirectoryName, AppAsarUnpackedBackupDirectoryName);
        }
        
        private string ApplyJsPatch(string fileName, string js, EnhancerConfig.PatchEntry patch, EPatchType patchType, out bool patchApplied)
        {
            patchApplied = false;

            if (patch.Applied)
            {
                return js;
            }

            if (!CanSearchPatchInFile(fileName, patch) || !ContainsSearchHint(js, patch.SearchHints))
            {
                return js;
            }
            
            var match = patch.Target.Match(js);
            if (!match.Success)
            {
                return js;
            }
            
            var prefix = $"[ENHANCER] [{patchType} -> {patch.Name}]";
            
            if(patch.SingleMatch && match.NextMatch().Success)
            {
                throw new Exception(
                    $"{prefix} Patch failed. Multiple target functions found. Looks like the version is not supported");
            }

            string patchSource = patch.Patch;

            if (patch.Resolver != null)
            {
                string resolvedField = patch.Resolver.Handler(match.Value);
                if (string.IsNullOrEmpty(resolvedField))
                {
                    throw new Exception($"{prefix} Resolver failed to find field name");
                }
                
                patchSource = patchSource.Replace(patch.Resolver.Placeholder, resolvedField);
            }
            
            _logger($"{prefix} Found target function in: " + Path.GetFileName(fileName), ELogType.Info);
            
            string newJs = patch.SingleMatch
                ? patch.Target.Replace(js, patchSource, 1)
                : patch.Target.Replace(js, patchSource);
            _logger($"{prefix} Patch applied", ELogType.Success);
            patch.Applied = true;
            patchApplied = true;
            
            return newJs;
        }

        private void PatchAsar()
        {
            var items = Directory.EnumerateFiles(_unpackedPath, $"*{JavaScriptFileExtension}", SearchOption.TopDirectoryOnly)
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
                        data = ApplyJsPatch(item, data, patchEntry, entry, out patchApplied);
                        fileChanged = fileChanged || patchApplied;
                    }

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
            
            if(remainingPatches.Count > 0)
            {
                var failedPatches = string.Join(", ", remainingPatches.Select(p => p.ToString()));
                throw new Exception($"[ENHANCER] Failed to apply patches: {failedPatches}. The version may not be supported.");
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
            foreach (var patchType in remainingPatches)
            {
                foreach (var patchEntry in enhancerConfig[patchType])
                {
                    if (patchEntry.Applied)
                    {
                        continue;
                    }

                    if (CanSearchPatchInFile(filePath, patchEntry))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private static bool CanSearchPatchInFile(string filePath, EnhancerConfig.PatchEntry patch)
        {
            if (patch.CandidateFileNames == null || patch.CandidateFileNames.Length == 0)
            {
                return true;
            }

            string fileName = Path.GetFileName(filePath);
            return patch.CandidateFileNames.Any(candidate => fileName.Equals(candidate, StringComparison.OrdinalIgnoreCase));
        }

        private static bool ContainsSearchHint(string source, string[] searchHints)
        {
            if (searchHints == null || searchHints.Length == 0)
            {
                return true;
            }

            return searchHints.Any(searchHint => source.IndexOf(searchHint, StringComparison.Ordinal) >= 0);
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

        private static void CopyDirectory(string sourceDir, string destinationDir)
        {
            Directory.CreateDirectory(destinationDir);

            foreach (var directory in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
            {
                var relativePath = directory.Substring(sourceDir.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                Directory.CreateDirectory(Path.Combine(destinationDir, relativePath));
            }

            foreach (var file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
            {
                var relativePath = file.Substring(sourceDir.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                var destinationPath = Path.Combine(destinationDir, relativePath);
                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath) ?? destinationDir);
                File.Copy(file, destinationPath, true);
            }
        }

        private static int CopyJavaScriptFiles(string sourceDir, string destinationDir)
        {
            if (string.IsNullOrEmpty(sourceDir) || !Directory.Exists(sourceDir))
            {
                return 0;
            }

            Directory.CreateDirectory(destinationDir);

            int copied = 0;
            foreach (var file in Directory.GetFiles(sourceDir, JavaScriptFileSearchPattern, SearchOption.TopDirectoryOnly))
            {
                File.Copy(file, GetAvailableScriptPath(destinationDir, Path.GetFileName(file)));
                copied++;
            }

            return copied;
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
            foreach (var file in files.Where(IsJavaScriptFile).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                File.Copy(file, GetAvailableScriptPath(destinationDir, Path.GetFileName(file)));
                copied++;
            }

            return copied;
        }

        private static bool IsJavaScriptFile(string file)
        {
            return File.Exists(file) && string.Equals(Path.GetExtension(file), JavaScriptFileExtension, StringComparison.OrdinalIgnoreCase);
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
                CopyDirectory(FindWorkspacePath(WebPanelDirectoryName, WebPanelDistDirectoryName), targetRoot);
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

        private void AttachProxyDll()
        {
            var assembly = Assembly.GetExecutingAssembly();
            var dll = assembly.GetManifestResourceStream(Constants.ProxyDllResouceName);
            if (dll == null)
            {
                throw new Exception("[ENHANCER] Proxy DLL resource not found");
            }
            var destPath = Path.Combine(_weModConfig.RootDirectory, "version.dll");
            using (var fileStream = File.Create(destPath))
            {
                dll.CopyTo(fileStream);
            }
            _logger("[ENHANCER] Proxy DLL attached", ELogType.Info);
        }

        public void Patch()
        {
            Common.TryKillProcess(_weModConfig.BrandName);
            if (!File.Exists(_backupPath))
            {
                _logger("[ENHANCER] Creating backup...", ELogType.Info);
                File.Copy(_asarPath, _backupPath);
            }
            else
            {
                _logger("[ENHANCER] Backup found, restoring pristine app.asar before patching...", ELogType.Info);
                File.Copy(_backupPath, _asarPath, true);
            }

            if (!Directory.Exists(_unpackedBackupPath) && Directory.Exists(_unpackedPath))
            {
                _logger("[ENHANCER] Creating backup of app.asar.unpacked...", ELogType.Info);
                CopyDirectory(_unpackedPath, _unpackedBackupPath);
            }
            else if (Directory.Exists(_unpackedBackupPath))
            {
                _logger("[ENHANCER] Restoring pristine app.asar.unpacked before patching...", ELogType.Info);
                if (Directory.Exists(_unpackedPath))
                {
                    Directory.Delete(_unpackedPath, true);
                }

                CopyDirectory(_unpackedBackupPath, _unpackedPath);
            }
            else if (!Directory.Exists(_unpackedPath))
            {
                throw new Exception("[ENHANCER] app.asar.unpacked is missing and no backup exists. Restore the original Wand installation files or reinstall Wand, then patch again.");
            }

            if(!File.Exists(_asarPath))
            {
                throw new Exception("app.asar not found");
            }

            try
            {
                _logger("[ENHANCER] Extracting app.asar...", ELogType.Info);
                AsarExtractor.ExtractAll(_asarPath, _unpackedPath);
            }
            catch (Exception e)
            {
                throw new Exception($"[ENHANCER] Failed to unpack app.asar: {e.Message}");
            }
            
            PatchAsar();
            InjectRemotePanelFiles();

            try
            {
                new AsarCreator(_unpackedPath, _asarPath, new CreateOptions
                {
                    Unpack = new Regex(@"^static\\unpacked.*$")
                }).CreatePackageWithOptions();
            }
            catch (Exception e)
            {
                throw new Exception($"[ENHANCER] Failed to pack app.asar: {e.Message}");
            }
            
            AttachProxyDll();
            
            _logger("[ENHANCER] Done!", ELogType.Success);
        }
    }
}