using System;
using System.Collections.Generic;
using System.IO;
using AsarSharp.Utils;

namespace AsarSharp.AsarFileSystem
{
    public class CrawledFileType
    {
        public FileType Type { get; set; }
        public FileSystemInfo Stat { get; set; }
    }

    public enum FileType
    {
        File,
        Directory,
        Link
    }

    public static class FileSystemCrawler
    {
        public static CrawledFileType DetermineFileType(string filename)
        {
            FileAttributes attributes;
            try
            {
                attributes = File.GetAttributes(filename);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                throw new IOException($"Failed to read attributes for '{filename}'", ex);
            }

            bool isDirectory = (attributes & FileAttributes.Directory) == FileAttributes.Directory;
            bool isLink = (attributes & FileAttributes.ReparsePoint) == FileAttributes.ReparsePoint;
            FileSystemInfo info = isDirectory
                ? (FileSystemInfo)new DirectoryInfo(filename)
                : new FileInfo(filename);

            if (isLink) return new CrawledFileType { Type = FileType.Link, Stat = info };
            if (isDirectory) return new CrawledFileType { Type = FileType.Directory, Stat = info };
            return new CrawledFileType { Type = FileType.File, Stat = info };
        }

        public static (List<string> filenames, Dictionary<string, CrawledFileType> metadata) CrawlFileSystem(string dir)
        {
            var metadata = new Dictionary<string, CrawledFileType>();
            var filenames = new List<string>();
            var links = new List<string>();

            foreach (var fullPath in CrawlIterative(dir))
            {
                var type = DetermineFileType(fullPath);
                metadata[fullPath] = type;
                if (type.Type == FileType.Link) links.Add(fullPath);
                filenames.Add(fullPath);
            }

            if (links.Count == 0) return (filenames, metadata);

            var filtered = new List<string>(filenames.Count);
            foreach (var filename in filenames)
            {
                bool isValid = true;
                string fileDir = Path.GetDirectoryName(filename) ?? string.Empty;

                foreach (var link in links)
                {
                    if (string.Equals(filename, link, StringComparison.OrdinalIgnoreCase)) continue;

                    // Require a separator after the prefix so "…/foobar" does not match link "…/foo".
                    if (filename.StartsWith(link + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    {
                        string rel = Extensions.GetRelativePath(link, fileDir);
                        if (!rel.StartsWith("..", StringComparison.Ordinal))
                        {
                            isValid = false;
                            break;
                        }
                    }
                }

                if (isValid) filtered.Add(filename);
            }

            return (filtered, metadata);
        }

        public static List<string> CrawlIterative(string dir)
        {
            var result = new List<string>();
            var stack = new Stack<DirectoryInfo>();

            string basePath = Extensions.GetBasePath(dir);
            if (!Directory.Exists(basePath)) return result;

            stack.Push(new DirectoryInfo(basePath));

            while (stack.Count > 0)
            {
                var current = stack.Pop();
                FileSystemInfo[] entries;
                try
                {
                    entries = current.GetFileSystemInfos();
                }
                catch (UnauthorizedAccessException)
                {
                    continue;
                }

                foreach (var entry in entries)
                {
                    result.Add(entry.FullName);
                    if (entry is DirectoryInfo subDir && (subDir.Attributes & FileAttributes.ReparsePoint) == 0)
                        stack.Push(subDir);
                }
            }

            return result;
        }
    }
}
