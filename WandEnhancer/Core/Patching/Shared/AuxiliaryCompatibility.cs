using System;
using System.IO;
using System.Linq;
using WandEnhancer.Core.Patching.Strategies;
using WandEnhancer.Core.Patching.Strategies.Static;

namespace WandEnhancer.Core.Patching.Shared
{
    internal static class AuxiliaryCompatibility
    {
        private static string Find(string unpackedPath)
        {
            string directory = string.IsNullOrEmpty(unpackedPath) ? null
                : Path.Combine(unpackedPath, @"static\unpacked\auxiliary");
            return directory != null && Directory.Exists(directory)
                ? Directory.EnumerateFiles(directory, "*AuxiliaryService.exe").SingleOrDefault() : null;
        }

        /// <summary>
        /// A missing service is skipped as "this install has none", so one quarantined mid-patch would
        /// otherwise leave a patch that reports success without it.
        /// </summary>
        public static void EnsureSurvivedPatching(string pristineUnpackedPath, string patchedUnpackedPath)
        {
            if (Find(pristineUnpackedPath) != null && Find(patchedUnpackedPath) == null)
                throw new FileNotFoundException("[ENHANCER] The auxiliary service disappeared while patching. " +
                                                "Antivirus probably quarantined it: add an exclusion for the Wand folder and patch again.");
        }

        public static void Apply(PatchContext context)
        {
            string auxiliary = Find(context.UnpackedPath);
            if (auxiliary == null)
            {
                context.Log?.Invoke("[ENHANCER] No auxiliary service found; skipping compatibility checks.", ELogType.Info);
                return;
            }
            if (AuxTrustNeutralizer.Neutralize(auxiliary, context.Log) < 0)
                throw new InvalidDataException("[ENHANCER] Unsupported auxiliary service; it would reject the patched Wand.");
        }
    }
}
