using System;
using System.Collections.Generic;
using System.IO;
using AsarSharp.Integrity;
using AsarSharp.Utils;

namespace AsarSharp.AsarFileSystem
{
    public class Filesystem
    {
        private readonly string _src;
        private FilesystemEntry _header;
        private int _headerSize;
        private long _offset;

        private const uint UINT32_MAX = 0xFFFFFFFF;

        public Filesystem(string src)
        {
            _src = Path.GetFullPath(src);
            _header = new FilesystemEntry { Files = new Dictionary<string, FilesystemEntry>(StringComparer.Ordinal) };
            _headerSize = 0;
            _offset = 0;
        }

        public string GetRootPath() => _src;
        public FilesystemEntry GetHeader() => _header;
        public int GetHeaderSize() => _headerSize;

        public void SetHeader(FilesystemEntry header, int headerSize)
        {
            _header = header;
            _headerSize = headerSize;
        }

        public FilesystemEntry SearchNodeFromDirectory(string p)
        {
            FilesystemEntry json = _header;

            int len = p.Length;
            int start = 0;

            // skip leading separators
            while (start < len && (p[start] == '/' || p[start] == '\\')) start++;

            while (start < len)
            {
                // find next separator
                int end = start;
                while (end < len && p[end] != '/' && p[end] != '\\') end++;

                int segLen = end - start;
                if (segLen == 0 || (segLen == 1 && p[start] == '.'))
                {
                    start = end + 1;
                    continue;
                }

                string seg = p.Substring(start, segLen);

                if (!json.IsDirectory)
                    throw new Exception($"Unexpected directory state while traversing: {p}");

                if (!json.Files.TryGetValue(seg, out var child))
                {
                    child = new FilesystemEntry { Files = new Dictionary<string, FilesystemEntry>(StringComparer.Ordinal) };
                    json.Files[seg] = child;
                }
                json = child;
                start = end + 1;
            }

            return json;
        }

        public (FilesystemEntry parent, string name) SearchNodeFromPathWithParent(string p)
        {
            string rel = Extensions.GetRelativePath(_src, p);
            if (string.IsNullOrEmpty(rel))
                return (_header, string.Empty);

            string name = Path.GetFileName(rel);
            string dir = Extensions.GetDirectoryName(rel);
            var parent = SearchNodeFromDirectory(dir);

            if (parent.Files == null)
                parent.Files = new Dictionary<string, FilesystemEntry>(StringComparer.Ordinal);

            if (!parent.Files.ContainsKey(name))
                parent.Files[name] = new FilesystemEntry();

            return (parent, name);
        }

        public List<string> ListFiles(bool isPack = false)
        {
            var files = new List<string>();
            FillFilesFromMetadata("/", _header);
            return files;

            void FillFilesFromMetadata(string basePath, FilesystemEntry metadata)
            {
                if (!metadata.IsDirectory) return;
                foreach (var entry in metadata.Files)
                {
                    string fullPath = Path.Combine(basePath, entry.Key).Replace('\\', '/');
                    string packState = entry.Value.Unpacked == true ? "unpack" : "pack  ";
                    files.Add(isPack ? $"{packState} : {fullPath}" : fullPath);
                    FillFilesFromMetadata(fullPath, entry.Value);
                }
            }
        }

        public FilesystemEntry GetNode(string p, bool followLinks = true)
        {
            p = p.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
            FilesystemEntry node = SearchNodeFromDirectory(Extensions.GetDirectoryName(p));
            string name = Path.GetFileName(p);

            if (node.IsLink && followLinks)
                return GetNode(Path.Combine(node.Link, name));

            if (!string.IsNullOrEmpty(name))
            {
                if (node.IsDirectory && node.Files.TryGetValue(name, out var entry))
                    return entry;
                return null;
            }

            return node;
        }

        public FilesystemEntry GetFile(string p, bool followLinks = true)
        {
            FilesystemEntry info = GetNode(p, followLinks);
            if (info == null) throw new Exception($"\"{p}\" was not found in this archive");
            if (info.IsLink && followLinks) return GetFile(info.Link, followLinks);
            return info;
        }

        public static string ReadLink(string path) => throw new NotImplementedException();

        #region Writing

        public FilesystemEntry SearchNodeFromPath(string p)
        {
            var (parent, name) = SearchNodeFromPathWithParent(p);
            if (string.IsNullOrEmpty(name)) return _header;
            return parent.Files[name];
        }

        public void InsertDirectory(string p, bool unpack)
        {
            FilesystemEntry node = SearchNodeFromPath(p);
            node.Files = node.Files ?? new Dictionary<string, FilesystemEntry>(StringComparer.Ordinal);
            node.Unpacked = unpack;
        }

        public void InsertFile(string path, bool shouldUnpack, CrawledFileType file,
            IntegrityHelper.FileIntegrity precomputedIntegrity = null)
        {
            var (dirNode, _) = SearchNodeFromPathWithParent(Path.GetDirectoryName(path) ?? path);
            var node = SearchNodeFromPath(path);

            long size;
            if (file.Stat is FileInfo fi)
                size = fi.Length;
            else
                throw new Exception($"{path}: stat is not a file");

            if (shouldUnpack || dirNode.Unpacked == true)
            {
                node.Size = size;
                node.Unpacked = true;
                node.Integrity = precomputedIntegrity ?? IntegrityHelper.GetFileIntegrity(path);
                return;
            }

            if (size > UINT32_MAX)
                throw new Exception($"{path}: file size cannot be larger than 4.2GB");

            node.Size = size;
            node.Offset = _offset.ToString();
            node.Integrity = precomputedIntegrity ?? IntegrityHelper.GetFileIntegrity(path);

            if (!Extensions.IsWindowsPlatform() && (file.Stat.Attributes & FileAttributes.Hidden) != 0)
                node.Executable = true;

            _offset += size;
        }

        #endregion
    }
}
