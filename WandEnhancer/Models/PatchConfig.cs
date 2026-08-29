using System.Collections.Generic;

namespace WandEnhancer.Models
{
    public enum EPatchType
    {
        ActivatePro = 1,
        DisableUpdates = 2,
        DevToolsOnF12 = 8,
        RemoteWebPanelPreview = 16
    }

    public sealed class PatchConfig
    {
        public HashSet<EPatchType> PatchTypes { get; set; }

        public List<string> CustomScriptPaths { get; set; } = new List<string>();

        /// <summary>When set, the patch selection is saved so the launcher re-applies it after a Wand update.</summary>
        public bool AutoApplyAfterUpdate { get; set; }
    }
}
