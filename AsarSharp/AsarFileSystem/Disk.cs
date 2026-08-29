using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using AsarSharp.Integrity;
using AsarSharp.PickleTools;
using AsarSharp.Utils;
using Newtonsoft.Json;

namespace AsarSharp.AsarFileSystem
{
    public static class Disk
    {
        private const int StreamBufferSize = 1024 * 1024;

        public class ArchiveHeader
        {
            public FilesystemEntry Header { get; set; }
            public string HeaderString { get; set; }
            public int HeaderSize { get; set; }
        }

        public class FilesystemFilesAndLinks
        {
            public List<BasicFileInfo> Files { get; set; } = new List<BasicFileInfo>();
        }

        public class BasicFileInfo
        {
            public string Filename { get; set; }
            public bool Unpack { get; set; }
        }

        #region Reading

        public static ArchiveHeader ReadArchiveHeaderSync(string archivePath)
        {
            using (var fs = new FileStream(archivePath, FileMode.Open, FileAccess.Read, FileShare.Read,
                       65536, FileOptions.SequentialScan))
            {
                byte[] sizeBuf = new byte[8];
                if (fs.ReadFull(sizeBuf, 0, 8) != 8)
                    throw new Exception("Unable to read header size");

                var sizePickle = Pickle.CreateFromBuffer(sizeBuf);
                var size = sizePickle.CreateIterator().ReadUInt32();

                var headerBuf = new byte[size];
                if (fs.ReadFull(headerBuf, 0, (int)size) != size)
                    throw new Exception("Unable to read header");

                var headerPickle = Pickle.CreateFromBuffer(headerBuf);
                var header = headerPickle.CreateIterator().ReadString();
                var headerObj = JsonConvert.DeserializeObject<FilesystemEntry>(header);

                return new ArchiveHeader
                {
                    Header = headerObj,
                    HeaderString = header,
                    HeaderSize = (int)size
                };
            }
        }

        /// <summary>
        /// Reads the header fresh every time: an archive is repacked in place during a patch run,
        /// so a cached header would hand out stale offsets on the next read of the same path.
        /// </summary>
        public static Filesystem ReadFilesystemSync(string archivePath)
        {
            var header = ReadArchiveHeaderSync(archivePath);
            var filesystem = new Filesystem(archivePath);
            filesystem.SetHeader(header.Header, header.HeaderSize);
            return filesystem;
        }

        #endregion

        public static void CopyFile(string dest, string rootPath, string filename)
        {
            if (dest == null)
                throw new ArgumentNullException(nameof(dest));
            if (rootPath == null)
                throw new ArgumentNullException(nameof(rootPath));
            if (filename == null)
                throw new ArgumentNullException(nameof(filename));

            string normalizedDestRoot = Path.GetFullPath(dest)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string normalizedRootPath = Path.GetFullPath(rootPath)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

            if (string.Equals(normalizedDestRoot, normalizedRootPath, StringComparison.OrdinalIgnoreCase))
                return;

            string sourcePath = Path.GetFullPath(Path.Combine(rootPath, filename));
            string destPath = Path.GetFullPath(Path.Combine(dest, filename));

            if (string.Equals(sourcePath, destPath, StringComparison.OrdinalIgnoreCase))
                return;

            Directory.CreateDirectory(Path.GetDirectoryName(destPath) ?? throw new InvalidOperationException());
            using (var src = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read, StreamBufferSize, FileOptions.SequentialScan))
            using (var dst = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None, StreamBufferSize, FileOptions.SequentialScan))
            {
                src.CopyTo(dst, StreamBufferSize);
            }
        }

        public static void WriteFileSystem(string dest, Filesystem fileSystem,
            FilesystemFilesAndLinks lists, Dictionary<string, CrawledFileType> metadata)
        {
            var serializerSettings = new JsonSerializerSettings
            {
                NullValueHandling = NullValueHandling.Ignore,
                DefaultValueHandling = DefaultValueHandling.Ignore
            };

            // --- Phase 1: write placeholder header ---
            string headerJson = JsonConvert.SerializeObject(fileSystem.GetHeader(), serializerSettings);
            var headerPickle = Pickle.CreateEmpty();
            headerPickle.WriteString(headerJson);

            var sizePickle = Pickle.CreateEmpty();
            sizePickle.WriteUInt32((uint)headerPickle.GetTotalSize());
            int sizePickleSize = sizePickle.GetTotalSize();

            var buf = new byte[StreamBufferSize];
            var blockBuf = new byte[4 * 1024 * 1024]; // shared across all files — avoids 4MB alloc per file

            // Build beside the target and swap at the end. Writing straight into dest truncates
            // it on open, so any failure mid-write left the caller with a destroyed archive.
            string tempPath = dest + ".building";
            try
            {
                WriteArchive(tempPath, dest, fileSystem, lists, serializerSettings,
                    headerPickle, sizePickle, sizePickleSize, buf, blockBuf);
                ReplaceFile(tempPath, dest);
            }
            catch
            {
                TryDelete(tempPath);
                throw;
            }
        }

        private static void ReplaceFile(string tempPath, string dest)
        {
            if (!File.Exists(dest))
            {
                File.Move(tempPath, dest);
                return;
            }

            // A read-only or hidden archive would fail the swap the same way an overwrite does.
            Extensions.ClearAttributes(dest);
            // File.Replace swaps in one step, so dest is never observed missing or half-written.
            File.Replace(tempPath, dest, null, true);
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                // Leftover build file only wastes space; the real failure is already propagating.
            }
        }

        private static void WriteArchive(string archivePath, string dest, Filesystem fileSystem,
            FilesystemFilesAndLinks lists, JsonSerializerSettings serializerSettings,
            Pickle headerPickle, Pickle sizePickle, int sizePickleSize, byte[] buf, byte[] blockBuf)
        {
            using (var fs = new FileStream(archivePath, FileMode.Create, FileAccess.Write, FileShare.None, StreamBufferSize, FileOptions.SequentialScan))
            {
                sizePickle.WriteTo(fs);
                headerPickle.WriteTo(fs);

                // --- Phase 2: stream files, hash in one pass, patch nodes in-memory ---
                foreach (var file in lists.Files)
                {
                    if (file.Unpack)
                    {
                        var relName = Extensions.GetRelativePath(fileSystem.GetRootPath(), file.Filename);
                        CopyFile($"{dest}.unpacked", fileSystem.GetRootPath(), relName);
                        CopyAndHash(file.Filename, null, buf, blockBuf, fileSystem);
                        continue;
                    }

                    CopyAndHash(file.Filename, fs, buf, blockBuf, fileSystem);
                }

                // --- Phase 3: re-serialize header with real hashes, seek back, overwrite ---
                string patchedJson = JsonConvert.SerializeObject(fileSystem.GetHeader(), serializerSettings);
                var patchedPickle = Pickle.CreateEmpty();
                patchedPickle.WriteString(patchedJson);

                var patchedSizePickle = Pickle.CreateEmpty();
                patchedSizePickle.WriteUInt32((uint)patchedPickle.GetTotalSize());

                // The rewrite lands on top of the placeholder header, so it must be exactly as
                // long. Placeholder hashes are the same width as real ones, so this holds unless
                // a file changed size between crawl and write - which would silently shred the
                // payload that follows.
                if (patchedPickle.GetTotalSize() != headerPickle.GetTotalSize() ||
                    patchedSizePickle.GetTotalSize() != sizePickleSize)
                {
                    throw new InvalidOperationException(
                        "ASAR header changed size while packing (a source file was modified mid-build). " +
                        "Aborting rather than writing a corrupt archive.");
                }

                fs.Position = 0;
                patchedSizePickle.WriteTo(fs);
                patchedPickle.WriteTo(fs);
            }
        }

        private static void CopyAndHash(string srcPath, Stream dest, byte[] buf, byte[] blockBuf, Filesystem fs)
        {
            string relPath = Extensions.GetRelativePath(fs.GetRootPath(), srcPath);
            var node = fs.GetNode(relPath, followLinks: false);

            long fileSize = node?.Size ?? 0;
            int estimatedBlocks = fileSize > 0 ? (int)((fileSize + 4 * 1024 * 1024 - 1) / (4 * 1024 * 1024)) : 0;

            using (var hasher = new IntegrityHelper.StreamingHasher(estimatedBlocks, blockBuf))
            using (var src = new FileStream(srcPath, FileMode.Open, FileAccess.Read, FileShare.Read, StreamBufferSize, FileOptions.SequentialScan))
            {
                int read;
                while ((read = src.Read(buf, 0, buf.Length)) > 0)
                {
                    hasher.Append(buf, 0, read);
                    dest?.Write(buf, 0, read);
                }

                if (node != null)
                    node.Integrity = hasher.Finalise();
            }
        }
    }
}
