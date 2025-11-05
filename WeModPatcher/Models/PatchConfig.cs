using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using WeModPatcher.Utils;

namespace WeModPatcher.Models
{

    public enum EPatchType
    {
        ActivatePro = 1,
        DisableUpdates = 2,
        DisableTelemetry = 4
    }

    public enum EPatchProcessMethod
    {
        None = 0,
        Runtime = 1,
        Static = 2
    }

    /*public sealed class PatchConfigOld
    {
        public HashSet<EPatchType> PatchTypes { get; set; }
        public EPatchProcessMethod PatchMethod { get; set; }
        public string Path { get; set; }
    }*/
    
    public sealed class PatchConfig
    {
        private string _path;
        public HashSet<EPatchType> PatchTypes { get; set; }
        public EPatchProcessMethod PatchMethod { get; set; }
        
        [JsonProperty("u")]
        public bool AutoApplyPatches { get; set; }
        
        [JsonIgnore]
        public WeModConfig AppProps { get; private set; }

        public string Path
        {
            get => _path;
            set
            {
                _path = value;
                AppProps = Extensions.CheckWeModPath(_path) ?? throw new Exception("Invalid WeMod path");
            }
        }

        /*public static void PushConfig(PatchConfig config)
        {
            var hash = GetConfigHash(config);
            var registry = _getRegistry();
            registry[hash] = config;
            _stashRegistry(registry);
        }

        public static void ActualizeRegistry()
        {
            var registry = _getRegistry();
            foreach (var entry in registry)
            {
                if(Extensions.CheckWeModPath(entry.Value.AppProps.RootDirectory) == null)
                {
                    registry.Remove(entry.Key);
                    break;
                }
            }
            _stashRegistry(registry);
        }

        public static PatchConfig GetConfig(string hash)
        {
            var registry = _getRegistry();
            return registry.TryGetValue(hash, out var config) ? config : null;
        }

        public static string GetConfigHash(PatchConfig config)
        {
            return Common.ComputeSha256Hash(config.AppProps.ExecutablePath);
        }

        private static Dictionary<string, PatchConfig> _getRegistry()
        {
            var currentDir = Common.GetCurrentDir();
            var registryPath = Path.Combine(currentDir, Constants.PatchRegistryName);
            try
            {
                return JsonConvert.DeserializeObject<Dictionary<string, PatchConfig>>(
                    File.ReadAllText(registryPath)
                );
            }
            catch
            {
                // ignored
            }

            return new Dictionary<string, PatchConfig>();
        }

        private static void _stashRegistry(Dictionary<string, PatchConfig> registry)
        {

            var currentDir = Common.GetCurrentDir();
            var registryPath = Path.Combine(currentDir, Constants.PatchRegistryName);

            if(registry.Count == 0)
            {
                if(File.Exists(registryPath))
                {
                    File.Delete(registryPath);
                }
                return;
            }


            var json = JsonConvert.SerializeObject(registry, Formatting.Indented);
            File.WriteAllText(registryPath, json);
        }*/
    }
    
}