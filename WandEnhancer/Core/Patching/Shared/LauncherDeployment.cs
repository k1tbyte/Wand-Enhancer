using System;
using System.IO;
using System.Reflection;
using WandEnhancer.Models;

namespace WandEnhancer.Core.Patching.Shared
{
    /// <summary>Deploys the launcher over the Squirrel stub and restores the original.</summary>
    internal static class LauncherDeployment
    {
        private const string StubBackupSuffix = ".stub";
        private static readonly string OwnImagePath = Assembly.GetExecutingAssembly().Location;

        public static void Deploy(WeModConfig install, Action<string, ELogType> log)
        {
            string stubPath = Path.Combine(SquirrelRootOf(install), install.ExecutableName);
            string stubBackup = stubPath + StubBackupSuffix;

            // Skip overwriting self during auto-patch.
            if (string.Equals(OwnImagePath, stubPath, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            if (File.Exists(stubPath) && !File.Exists(stubBackup))
            {
                AsarSharp.Utils.Extensions.CopyOver(stubPath, stubBackup);
            }

            AsarSharp.Utils.Extensions.CopyOver(OwnImagePath, stubPath);

            // Shortcuts point at the stub we just replaced, so give it Wand's own icon (cosmetic).
            if (File.Exists(stubBackup) && !IconTransplant.Copy(stubBackup, stubPath))
            {
                log?.Invoke("[ENHANCER] Could not copy Wand's icon to the launcher; using the default.", ELogType.Warn);
            }

            log?.Invoke("[ENHANCER] Launcher deployed to root directory", ELogType.Info);
        }

        public static void Restore(WeModConfig install)
        {
            string stubPath = Path.Combine(SquirrelRootOf(install), install.ExecutableName);

            // Skip restore if running as deployed launcher (file is locked; UI must restore later).
            if (string.Equals(OwnImagePath, stubPath, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            string stubBackup = stubPath + StubBackupSuffix;
            if (File.Exists(stubBackup))
            {
                AsarSharp.Utils.Extensions.CopyOver(stubBackup, stubPath);
                File.Delete(stubBackup);
            }
        }

        public static string SquirrelRootOf(WeModConfig install)
        {
            string root = Directory.GetParent(install.RootDirectory)?.FullName;
            if (string.IsNullOrEmpty(root))
            {
                throw new Exception("[ENHANCER] Cannot determine Squirrel root directory");
            }

            return root;
        }
    }
}
