using System;
using System.IO;
using System.Linq;
using WandEnhancer.Core.Patching.Strategies;
using WandEnhancer.Core.Patching.Strategies.Static;

namespace WandEnhancer.Core.Patching.Shared
{
    internal static class AuxiliaryCompatibility
    {
        public static void Apply(PatchContext context, bool includeTrustCheck)
        {
            string directory = string.IsNullOrEmpty(context.UnpackedPath) ? null
                : Path.Combine(context.UnpackedPath, @"static\unpacked\auxiliary");
            string auxiliary = directory != null && Directory.Exists(directory)
                ? Directory.EnumerateFiles(directory, "*AuxiliaryService.exe").SingleOrDefault() : null;
            if (auxiliary == null)
            {
                context.Log?.Invoke("[ENHANCER] No auxiliary service found; skipping compatibility checks.", ELogType.Info);
                return;
            }
            if (AuxTrustNeutralizer.Neutralize(auxiliary, context.Log, includeTrustCheck) < 0)
                throw new InvalidDataException("[ENHANCER] Unsupported auxiliary service; it would reject the patched Wand.");
        }
    }
}
