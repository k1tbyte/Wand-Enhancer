using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using WandEnhancer.Utils;

namespace WandEnhancer.Models
{

    public enum EPatchType
    {
        ActivatePro = 1,
        DisableUpdates = 2,
        DisableTelemetry = 4,
        DevToolsOnF12 = 8,
        RemoteWebPanelPreview = 16
    }
    
    public sealed class PatchConfig
    {
        private string _path;
        public HashSet<EPatchType> PatchTypes { get; set; }

        public List<string> CustomScriptPaths { get; set; } = new List<string>();
        
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