using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

namespace AsarSharp.Utils
{
    public static class Extensions
    {
        /// <summary>
        /// Fills <paramref name="count"/> bytes. Stream.Read may legally return fewer than
        /// asked for; treating a short read as EOF corrupts header parsing and block hashes.
        /// Returns the bytes actually read, which is less than count only at end of stream.
        /// </summary>
        public static int ReadFull(this Stream stream, byte[] buffer, int offset, int count)
        {
            int total = 0;
            while (total < count)
            {
                int read = stream.Read(buffer, offset + total, count - total);
                if (read <= 0)
                {
                    break;
                }

                total += read;
            }

            return total;
        }

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

        /// <summary>
        /// Security check for archive extraction: returns true only when
        /// <paramref name="candidate"/> resolves to a location inside
        /// <paramref name="root"/>. Both paths are fully normalised first, so
        /// embedded ".." segments cannot escape the root (zip-slip). The
        /// <see cref="GetRelativePath"/> fast path must not be used here because
        /// it strips the prefix literally without resolving "..".
        /// </summary>
        public static bool IsPathInside(string root, string candidate)
        {
            string fullRoot = TrimTrailingSeparators(Path.GetFullPath(root));
            string fullCandidate = TrimTrailingSeparators(Path.GetFullPath(candidate));

            if (string.Equals(fullRoot, fullCandidate, StringComparison.OrdinalIgnoreCase))
                return true;

            return fullCandidate.Length > fullRoot.Length
                   && fullCandidate.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase)
                   && IsSeparator(fullCandidate[fullRoot.Length]);
        }

        public static string GetDirectoryName(string path)
        {
            if (string.IsNullOrEmpty(path))
                return ".";

            string result = Path.GetDirectoryName(path);

            if (string.IsNullOrEmpty(result))
                return ".";

            return result;
        }

        /// <summary>
        /// Overwrites <paramref name="destination"/>, clearing attributes on both ends. CopyFile
        /// carries the source's ReadOnly flag onto the copy and then refuses to overwrite what it
        /// produced, failing with "Access to the path is denied" - so one read-only source (an exe
        /// run straight out of a .zip, say) poisons the destination for every later run.
        /// </summary>
        public static void CopyOver(string source, string destination)
        {
            ClearAttributes(destination);

            try
            {
                File.Copy(source, destination, true);
            }
            catch (UnauthorizedAccessException e)
            {
                throw new UnauthorizedAccessException($"{e.Message} {DescribeDenial(destination)}", e);
            }

            ClearAttributes(destination);
        }

        /// <summary>
        /// "Access to the path is denied" names none of the half-dozen things that cause it, and
        /// the state is gone by the time anyone reads the report. Attributes were already cleared
        /// above, which rules the most common cause out before the message is even written.
        /// </summary>
        private static string DescribeDenial(string destination)
        {
            if (Directory.Exists(destination))
            {
                return "The destination is a directory, not a file.";
            }

            if (!File.Exists(destination))
            {
                return "The destination does not exist, so the containing folder is refusing new files.";
            }

            return $"Attributes {File.GetAttributes(destination)}, owner {DescribeOwner(destination)}, " +
                   $"running as {Environment.UserName}. A read-only flag, antivirus, folder " +
                   "permissions or a delete still pending on the file are the usual causes.";
        }

        private static string DescribeOwner(string path)
        {
            try
            {
                return File.GetAccessControl(path).GetOwner(typeof(NTAccount)).Value;
            }
            catch (Exception e) when (e is IdentityNotMappedException || e is UnauthorizedAccessException ||
                                      e is InvalidOperationException || e is PrivilegeNotHeldException ||
                                      e is PlatformNotSupportedException)
            {
                return "unreadable";
            }
        }

        /// <summary>
        /// Resets a file to Normal: ReadOnly, Hidden and System all block an overwrite. Best
        /// effort - a file that denies even this reports it properly through the write that follows.
        /// </summary>
        public static void ClearAttributes(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    File.SetAttributes(path, FileAttributes.Normal);
                }
            }
            catch (Exception e) when (e is UnauthorizedAccessException || e is IOException)
            {
                // Swallowed so the caller's own failure is the one that surfaces.
            }
        }

        public static void CopyDirectory(string sourceDir, string destinationDir)
        {
            Directory.CreateDirectory(destinationDir);

            foreach (var file in Directory.GetFiles(sourceDir))
            {
                var destFile = Path.Combine(destinationDir, Path.GetFileName(file));
                CopyOver(file, destFile);
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

            RunTool("chmod", $"{permission} \"{filePath}\"");
        }


        public static void CreateSymbolicLink(string linkTarget, string linkPath)
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                bool success = NativeMethods.CreateSymbolicLink(linkPath, linkTarget,
                    Directory.Exists(linkTarget)
                        ? NativeMethods.SymLinkFlag.Directory
                        : NativeMethods.SymLinkFlag.File);
                if (!success)
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                return;
            }

            RunTool("ln", $"-s \"{linkTarget}\" \"{linkPath}\"");
        }

        public static bool IsWindowsPlatform()
        {
            return RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
        }

        private static void RunTool(string fileName, string arguments)
        {
            using (var process = new System.Diagnostics.Process
                   {
                       StartInfo = new System.Diagnostics.ProcessStartInfo
                       {
                           FileName = fileName,
                           Arguments = arguments,
                           UseShellExecute = false,
                           CreateNoWindow = true
                       }
                   })
            {
                process.Start();
                process.WaitForExit();
                if (process.ExitCode != 0)
                    throw new InvalidOperationException($"Tool {fileName} failed with exit code {process.ExitCode}.");
            }
        }
    }
}
