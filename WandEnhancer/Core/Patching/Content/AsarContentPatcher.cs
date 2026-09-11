using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using WandEnhancer.Models;

namespace WandEnhancer.Core.Patching.Content
{
    internal class AsarContentPatcher
    {
        private const string JavaScriptFileSearchPattern = "*.js";
        private const string IndexBundleFileName = "index.js";
        private const string AppBundleFilePrefix = "app-";
        private const string AppBundleFileSuffix = ".bundle.js";

        private readonly string _unpackedPath;
        private readonly Action<string, ELogType> _logger;
        private readonly JavaScriptPatchApplier _applier;

        internal AsarContentPatcher(string unpackedPath, Action<string, ELogType> logger, JavaScriptPatchApplier applier)
        {
            _unpackedPath = unpackedPath;
            _logger = logger;
            _applier = applier;
        }

        internal void Patch(IReadOnlyCollection<EPatchType> patchTypes)
        {
            var items = Directory.EnumerateFiles(_unpackedPath, JavaScriptFileSearchPattern, SearchOption.TopDirectoryOnly)
                .Where(IsCandidateBundleFile)
                .ToList();

            if (!items.Any())
            {
                throw new Exception("[ENHANCER] No app bundle found");
            }

            var remainingPatches = new HashSet<EPatchType>(patchTypes);
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
                        data = _applier.Apply(item, data, patchEntry, entry, out patchApplied);
                        fileChanged = fileChanged || patchApplied;
                    }

                    // Optional patches stay in the scan until every file is checked.
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
    }
}