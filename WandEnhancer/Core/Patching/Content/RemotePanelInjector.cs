using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using WandEnhancer.Models;
using WandEnhancer.Utils;

namespace WandEnhancer.Core.Patching.Content
{
    internal class RemotePanelInjector
    {
        private const string JavaScriptFileSearchPattern = "*.js";
        private const string LocalCustomScriptsDirectoryName = "renderer-scripts";
        private const string RemotePanelDirectoryName = "remote-panel";
        private const string RemoteBridgeTargetFileName = "bridge.cjs";
        private const string RemoteRendererScriptsDirectoryName = "renderer-scripts";
        private const string EmbeddedRemotePanelDistPrefix = "remote-panel/dist/";
        private const string WebPanelDirectoryName = "web-panel";
        private const string WebPanelDistDirectoryName = "dist";
        private const string DuplicateScriptSuffix = ".custom";
        private const int FirstDuplicateScriptIndex = 1;

        private readonly string _unpackedPath;
        private readonly Action<string, ELogType> _logger;

        internal RemotePanelInjector(string unpackedPath, Action<string, ELogType> logger)
        {
            _unpackedPath = unpackedPath;
            _logger = logger;
        }

        internal void Inject(IReadOnlyCollection<EPatchType> patchTypes, IEnumerable<string> customScriptPaths)
        {
            if (!patchTypes.Contains(EPatchType.RemoteWebPanelPreview))
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

            int selectedScriptCount = CopySelectedJavaScriptFiles(customScriptPaths, targetScriptsRoot);
            int localScriptCount = CopyJavaScriptFiles(localCustomScriptsRoot, targetScriptsRoot);

            _logger($"[ENHANCER] Injected remote panel assets and renderer scripts into app.asar (default: {defaultScriptCount}, selected: {selectedScriptCount}, local: {localScriptCount})", ELogType.Info);
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
    }
}