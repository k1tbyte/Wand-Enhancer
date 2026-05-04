using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using AsarSharp.AsarFileSystem;
using AsarSharp.Utils;

namespace AsarSharp
{
    public class AsarExtractor
    {
        private const int IO_BUFFER_SIZE = 1024 * 1024;
        private const int FS_INTERNAL_BUFFER = 4096;

        public static void ExtractAll(string archivePath, string dest)
        {
            var filesystem = Disk.ReadFilesystemSync(archivePath);
            var filenames = filesystem.ListFiles();

            // On Windows, links are extracted as plain files.
            bool followLinks = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

            Directory.CreateDirectory(dest);

            byte[] ioBuffer = new byte[IO_BUFFER_SIZE];
            var dirCache = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Path.GetFullPath(dest) };
            var extractionErrors = new List<Exception>();
            string rootPath = filesystem.GetRootPath();
            long dataOffset = 8 + filesystem.GetHeaderSize();

            // One archive handle for all reads — old code opened it per file.
            using (var archive = new FileStream(rootPath, FileMode.Open, FileAccess.Read, FileShare.Read,
                       FS_INTERNAL_BUFFER, FileOptions.RandomAccess))
            {
                foreach (var fullPath in filenames)
                {
                    try
                    {
                        var filename = fullPath.Substring(1);
                        var destFilename = Path.Combine(dest, filename);
                        var file = filesystem.GetFile(filename, followLinks);

                        // Path-traversal guard.
                        string relativePath = Extensions.GetRelativePath(dest, destFilename);
                        if (relativePath.StartsWith(".."))
                        {
                            throw new InvalidOperationException(
                                $"{fullPath}: file \"{destFilename}\" writes out of the package");
                        }

                        if (file.IsDirectory)
                        {
                            EnsureDirectory(destFilename, dirCache);
                            continue;
                        }

                        if (file.IsLink)
                        {
                            ExtractLink(dest, fullPath, destFilename, file, dirCache);
                            continue;
                        }

                        if (!file.IsFile) continue;

                        try
                        {
                            ExtractFile(archive, dataOffset, rootPath, filename, destFilename, file, ioBuffer, dirCache);

                            if (file.Executable == true && !RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                            {
                                Extensions.SetUnixFilePermission(destFilename, "755");
                            }
                        }
                        catch (Exception e)
                        {
                            extractionErrors.Add(e);
                        }
                    }
                    catch (Exception ex)
                    {
                        extractionErrors.Add(ex);
                    }
                }
            }

            if (extractionErrors.Count > 0)
            {
                throw new AggregateException(
                    "Unable to extract some files:\n\n" +
                    string.Join("\n\n", extractionErrors.Select(e => e.ToString())),
                    extractionErrors);
            }
        }

        private static void EnsureDirectory(string path, HashSet<string> cache)
        {
            string full = Path.GetFullPath(path);
            if (cache.Contains(full)) return;
            Directory.CreateDirectory(full);
            // Mark every ancestor too so siblings skip the syscall.
            string p = full;
            while (!string.IsNullOrEmpty(p) && cache.Add(p))
            {
                p = Path.GetDirectoryName(p);
            }
        }

        private static void EnsureParentDir(string filePath, HashSet<string> cache)
        {
            string parent = Path.GetDirectoryName(filePath);
            if (string.IsNullOrEmpty(parent)) return;
            EnsureDirectory(parent, cache);
        }

        private static void ExtractFile(FileStream archive, long dataOffset, string rootPath,
            string filename, string destFilename, FilesystemEntry file, byte[] buffer,
            HashSet<string> dirCache)
        {
            EnsureParentDir(destFilename, dirCache);

            if (file.Unpacked == true)
            {
                string unpackedSourcePath = Path.GetFullPath(Path.Combine($"{rootPath}.unpacked", filename));
                string unpackedDestPath = Path.GetFullPath(destFilename);

                if (string.Equals(unpackedSourcePath, unpackedDestPath, StringComparison.OrdinalIgnoreCase))
                    return; // self-copy
                if (!File.Exists(unpackedSourcePath))
                    return; // header references a missing unpacked file — skip rather than abort

                File.Copy(unpackedSourcePath, destFilename, true);
                return;
            }

            long size = file.Size ?? 0;
            using (var dst = new FileStream(destFilename, FileMode.Create, FileAccess.Write, FileShare.None,
                       FS_INTERNAL_BUFFER, FileOptions.SequentialScan))
            {
                if (size <= 0) return;

                archive.Position = dataOffset + long.Parse(file.Offset);
                long remaining = size;
                while (remaining > 0)
                {
                    int toRead = remaining > buffer.Length ? buffer.Length : (int)remaining;
                    int got = archive.Read(buffer, 0, toRead);
                    if (got <= 0) throw new EndOfStreamException("Archive truncated");
                    dst.Write(buffer, 0, got);
                    remaining -= got;
                }
            }
        }

        private static void ExtractLink(string dest, string fullPath, string destFilename,
            FilesystemEntry file, HashSet<string> dirCache)
        {
            var linkSrcPath = Extensions.GetDirectoryName(Path.Combine(dest, file.Link));
            var linkDestPath = Extensions.GetDirectoryName(destFilename);
            var relativeLinkPath = Extensions.GetRelativePath(linkDestPath, linkSrcPath);

            try { File.Delete(destFilename); }
            catch { /* ignore — failing to remove an existing link is non-fatal */ }

            var linkTo = Path.Combine(relativeLinkPath, Path.GetFileName(file.Link));

            if (Extensions.GetRelativePath(dest, linkSrcPath).StartsWith(".."))
            {
                throw new InvalidOperationException(
                    $"{fullPath}: file \"{file.Link}\" links out of the package to \"{linkSrcPath}\"");
            }

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                var targetPath = Path.Combine(linkSrcPath, Path.GetFileName(file.Link));
                if (Directory.Exists(targetPath))
                {
                    EnsureDirectory(destFilename, dirCache);
                    Extensions.CopyDirectory(targetPath, destFilename);
                }
                else if (File.Exists(targetPath))
                {
                    EnsureParentDir(destFilename, dirCache);
                    File.Copy(targetPath, destFilename, true);
                }
            }
            else
            {
                EnsureParentDir(destFilename, dirCache);
                Extensions.CreateSymbolicLink(linkTo, destFilename);
            }
        }
    }
}
