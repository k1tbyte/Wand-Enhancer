using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using AsarSharp;
using Newtonsoft.Json;
using WandEnhancer.Models;
using WandEnhancer.Utils;
using WandEnhancer.View.MainWindow;
using Application = System.Windows.Application;

namespace WandEnhancer.Core
{
    public class Enhancer
    {


        
        private readonly WeModConfig _weModConfig;
        private readonly Action<string, ELogType> _logger;
        private readonly PatchConfig _config;
        private readonly string _asarPath;
        private readonly string _backupPath;
        private readonly string _unpackedPath;

        public Enhancer(WeModConfig weModConfig, Action<string, ELogType> logger, PatchConfig config)
        {
            _weModConfig = weModConfig;
            _logger = logger;
            _config = config;

            _asarPath = Path.Combine(weModConfig.RootDirectory, "resources", "app.asar");
            _unpackedPath = Path.Combine(weModConfig.RootDirectory, "resources", "app.asar.unpacked");
            _backupPath = Path.Combine(weModConfig.RootDirectory, "resources", "app.asar.backup");
        }
        
        private string ApplyJsPatch(string fileName, string js, EnhancerConfig.PatchEntry patch, EPatchType patchType)
        {
            if (patch.Applied)
            {
                return js;
            }
            
            var matches = patch.Target.Matches(js);
            if (matches.Count == 0)
            {
                return js;
            }
            
            var prefix = $"[ENHANCER] [{patchType} -> {patch.Name}]";
            
            if(matches.Count > 1 && patch.SingleMatch)
            {
                throw new Exception(
                    $"{prefix} Patch failed. Multiple target functions found. Looks like the version is not supported");
            }

            if (patch.Resolver != null)
            {
                string resolvedField = patch.Resolver.Handler(matches[0].Value);
                if (string.IsNullOrEmpty(resolvedField))
                {
                    throw new Exception($"{prefix} Resolver failed to find field name");
                }
                
                patch.Patch = patch.Patch.Replace(patch.Resolver.Placeholder, resolvedField);
            }
            
            _logger($"{prefix} Found target function in: " + Path.GetFileName(fileName), ELogType.Info);
            
            string newJs = patch.Target.Replace(js, patch.Patch);
            File.WriteAllText(fileName, newJs);
            _logger($"{prefix} Patch applied", ELogType.Success);
            patch.Applied = true;
            
            return newJs;
        }

        private void PatchAsar()
        {
            var items = Directory.EnumerateFiles(_unpackedPath)
                .Where(file => !Directory.Exists(file) && Regex.IsMatch(Path.GetFileName(file), @"^app-\w+|index\.js"))
                .ToList();

            if (!items.Any())
            {
                throw new Exception("[ENHANCER] No app bundle found");
            }
            
            // Track patches that still need to be completed
            var remainingPatches = new HashSet<EPatchType>(_config.PatchTypes);
            var enhancerConfig = EnhancerConfig.GetInstance();

            foreach (var item in items)
            {
                if (remainingPatches.Count == 0)
                {
                    break;
                }
                
                string data = File.ReadAllText(item);
                
                // Iterate over a copy of the list so we can modify the HashSet
                foreach (var entry in remainingPatches.ToList())
                {
                    var entries = enhancerConfig[entry];
                    foreach (var patchEntry in entries)
                    {
                        // Update data in memory so subsequent patches in the same file work on latest content
                        data = ApplyJsPatch(item, data, patchEntry, entry);
                    }

                    // Check if all entries for this patch type are applied
                    if (entries.All(x => x.Applied))
                    {
                        remainingPatches.Remove(entry);
                    }
                }
            }
            
            if(remainingPatches.Count > 0)
            {
                var failedPatches = string.Join(", ", remainingPatches.Select(p => p.ToString()));
                throw new Exception($"[ENHANCER] Failed to apply patches: {failedPatches}. The version may not be supported.");
            }
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
                _logger("[ENHANCER] Backup already exists", ELogType.Warn);
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