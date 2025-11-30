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
    
    public sealed class PatchConfig
    {
        private string _path;
        public HashSet<EPatchType> PatchTypes { get; set; }
        
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
    }
    
}