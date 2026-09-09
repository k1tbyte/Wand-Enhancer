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

    public enum EPatchStrategy
    {
        // Zero is the legacy default: configs written before this field existed were supervised.
        Supervised = 0,
        Static = 1
    }

    public sealed class PatchConfig
    {
        public HashSet<EPatchType> PatchTypes { get; set; }

        /// <summary>
        /// How the fuse is defeated. Left at the zero value (<see cref="EPatchStrategy.Supervised"/>)
        /// so a config saved before this field existed still launches the way it was patched; the UI
        /// picks <see cref="EPatchStrategy.Static"/> for new patches.
        /// </summary>
        public EPatchStrategy Strategy { get; set; }

        public List<string> CustomScriptPaths { get; set; } = new List<string>();

        /// <summary>When set, the launcher re-applies the saved patch selection after a Wand update.</summary>
        public bool AutoApplyAfterUpdate { get; set; }
    }
}
