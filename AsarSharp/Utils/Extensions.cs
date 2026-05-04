using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace AsarSharp.Utils
{
    internal static class Extensions
    {
        /// <summary>
        /// Compute path relative to <paramref name="relativeTo"/>.
        /// Fast common-case (path is inside relativeTo): plain prefix-strip.
        /// Falls back to <see cref="Path.GetFullPath"/> + manual relativisation
        /// when paths must be normalised or '..' segments are required.
        /// Replaces previous URI-based implementation which was a large hot-path cost.
        /// </summary>
        public static string GetRelativePath(string relativeTo, string path)
        {
            if (string.IsNullOrEmpty(relativeTo))
                throw new ArgumentNullException(nameof(relativeTo));
            if (string.IsNullOrEmpty(path))
                throw new ArgumentNullException(nameof(path));

            // Fast path: literal prefix match (no normalisation). Covers ~all
            // intra-archive callers where both inputs already come from the
            // same crawl pass.
            string baseFast = TrimTrailingSeparators(relativeTo);
            string pathFast = TrimTrailingSeparators(path);

            if (string.Equals(baseFast, pathFast, StringComparison.OrdinalIgnoreCase))
                return string.Empty;

            if (pathFast.Length > baseFast.Length &&
                pathFast.StartsWith(baseFast, StringComparison.OrdinalIgnoreCase) &&
                IsSeparator(pathFast[baseFast.Length]))
            {
                return pathFast.Substring(baseFast.Length + 1);
            }

            // Slow path: normalise both sides and compute relative — used for
            // security checks (out-of-tree symlink/destination guards) and the
            // rare "go up" case.
            return GetRelativePathNormalised(relativeTo, path);
        }

        private static string GetRelativePathNormalised(string relativeTo, string path)
        {
            string fullBase = Path.GetFullPath(relativeTo);
            string fullPath = Path.GetFullPath(path);

            fullBase = TrimTrailingSeparators(fullBase);
            fullPath = TrimTrailingSeparators(fullPath);

            if (string.Equals(fullBase, fullPath, StringComparison.OrdinalIgnoreCase))
                return string.Empty;

            if (fullPath.Length > fullBase.Length &&
                fullPath.StartsWith(fullBase, StringComparison.OrdinalIgnoreCase) &&
                IsSeparator(fullPath[fullBase.Length]))
            {
                return fullPath.Substring(fullBase.Length + 1);
            }

            // Need to walk up the common ancestor.
            char sep = Path.DirectorySeparatorChar;
            string[] baseParts = fullBase.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);
            string[] pathParts = fullPath.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);

            int common = 0;
            int max = Math.Min(baseParts.Length, pathParts.Length);
            while (common < max &&
                   string.Equals(baseParts[common], pathParts[common], StringComparison.OrdinalIgnoreCase))
            {
                common++;
            }

            var sb = new StringBuilder();
            for (int i = common; i < baseParts.Length; i++)
            {
                if (sb.Length > 0) sb.Append(sep);
                sb.Append("..");
            }
            for (int i = common; i < pathParts.Length; i++)
            {
                if (sb.Length > 0) sb.Append(sep);
                sb.Append(pathParts[i]);
            }
            return sb.ToString();
        }

        private static string TrimTrailingSeparators(string s)
        {
            int end = s.Length;
            while (end > 0 && IsSeparator(s[end - 1])) end--;
            return end == s.Length ? s : s.Substring(0, end);
        }

        private static bool IsSeparator(char c) => c == '/' || c == '\\';

        public static string GetDirectoryName(string path)
        {
            if (string.IsNullOrEmpty(path))
                return ".";

            string result = Path.GetDirectoryName(path);

            if (string.IsNullOrEmpty(result))
                return ".";

            return result;
        }

        public static void CopyDirectory(string sourceDir, string destinationDir)
        {
            Directory.CreateDirectory(destinationDir);

            foreach (var file in Directory.GetFiles(sourceDir))
            {
                var destFile = Path.Combine(destinationDir, Path.GetFileName(file));
                File.Copy(file, destFile, true);
            }

            foreach (var dir in Directory.GetDirectories(sourceDir))
            {
                var destDir = Path.Combine(destinationDir, Path.GetFileName(dir));
                CopyDirectory(dir, destDir);
            }
        }

        public static string GetBasePath(string dir)
        {
            int wildcardIndex = dir.IndexOfAny(new[] { '*', '?' });
            if (wildcardIndex == -1)
            {
                return dir;
            }

            int lastSeparatorIndex = dir.LastIndexOf(Path.DirectorySeparatorChar, wildcardIndex);
            if (lastSeparatorIndex == -1)
            {
                return ".";
            }

            return dir.Substring(0, lastSeparatorIndex);
        }

        public static void SetUnixFilePermission(string filePath, string permission)
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                return;

            var process = new System.Diagnostics.Process
            {
                StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "chmod",
                    Arguments = $"{permission} \"{filePath}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                }
            };
            process.Start();
            process.WaitForExit();
        }


        public static void CreateSymbolicLink(string linkTarget, string linkPath)
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                NativeMethods.CreateSymbolicLink(linkPath, linkTarget,
                    Directory.Exists(linkTarget)
                        ? NativeMethods.SymLinkFlag.Directory
                        : NativeMethods.SymLinkFlag.File);
                return;
            }

            var process = new System.Diagnostics.Process
            {
                StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "ln",
                    Arguments = $"-s \"{linkTarget}\" \"{linkPath}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                }
            };
            process.Start();
            process.WaitForExit();
        }


        public static bool IsWindowsPlatform()
        {
            return Environment.OSVersion.Platform == PlatformID.Win32NT;
        }
    }
}
