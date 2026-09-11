using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using WandEnhancer.Core.Patching.Shared;

namespace WandEnhancer.Core.Patching.Strategies.Static
{
    internal sealed class StaticStrategy : IPatchStrategy
    {
        private const string AuxiliaryDirectory = @"static\unpacked\auxiliary";
        private const string AuxiliarySearchPattern = "*AuxiliaryService.exe";

        public bool RequiresLauncherAlways => false;

        public void ApplyEnablement(PatchContext context)
        {
            if (!DiskFusePatch.Apply(context.Install.ExecutablePath, context.Log))
            {
                throw new Exception($"[ENHANCER] Could not clear the ASAR integrity fuse in {Path.GetFileName(context.Install.ExecutablePath)}.");
            }

            string aux = FindAuxiliary(context.UnpackedPath);
            if (aux == null)
            {
                context.Log?.Invoke("[ENHANCER] No auxiliary service found; skipping check.", ELogType.Info);
                return;
            }

            if (AuxTrustNeutralizer.Neutralize(aux, context.Log) < 0)
            {
                throw new Exception("[ENHANCER] Could not neutralise the auxiliary service trust check; it would reject the patched Wand.");
            }
        }

        public bool Launch(PatchContext context, string args)
        {
            try
            {
                // dispose handle; process keeps running
                Process.Start(new ProcessStartInfo(context.Install.ExecutablePath, args ?? string.Empty)
                {
                    UseShellExecute = false,
                    WorkingDirectory = Path.GetDirectoryName(context.Install.ExecutablePath)
                })?.Dispose();
                return true;
            }
            catch (Exception e)
            {
                context.Log?.Invoke($"Could not start Wand: {e.Message}", ELogType.Error);
                return false;
            }
        }

        private static string FindAuxiliary(string unpackedPath)
        {
            if (string.IsNullOrEmpty(unpackedPath))
            {
                return null;
            }

            string directory = Path.Combine(unpackedPath, AuxiliaryDirectory);
            return Directory.Exists(directory)
                ? Directory.EnumerateFiles(directory, AuxiliarySearchPattern).FirstOrDefault()
                : null;
        }
    }
}
