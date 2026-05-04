using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using AsarSharp.Utils;

namespace AsarSharp.AsarFileSystem
{
    public class CrawledFileType
    {
        public FileType Type { get; set; }
        public FileSystemInfo Stat { get; set; }
        public TransformedFile Transformed { get; set; }
    }

    public class TransformedFile
    {
        public string Path { get; set; }
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
                return null;
            }

            bool isDirectory = (attributes & FileAttributes.Directory) == FileAttributes.Directory;
            bool isLink = (attributes & FileAttributes.ReparsePoint) == FileAttributes.ReparsePoint;
            FileSystemInfo info = isDirectory
                ? (FileSystemInfo)new DirectoryInfo(filename)
                : new FileInfo(filename);

            if (isLink)
            {
                return new CrawledFileType { Type = FileType.Link, Stat = info };
            }

            if (isDirectory)
            {
                return new CrawledFileType { Type = FileType.Directory, Stat = info };
            }

            return new CrawledFileType { Type = FileType.File, Stat = info };
        }

        public static (List<string> filenames, Dictionary<string, CrawledFileType> metadata) CrawlFileSystem(string dir)
        {
            var metadata = new Dictionary<string, CrawledFileType>();
            var crawled = CrawlIterative(dir);
            var results = crawled.Select(filename => new { filename, type = DetermineFileType(filename) }).ToList();

            var links = new List<string>();
            var filenames = new List<string>();

            foreach (var result in results.Where(result => result.type != null))
            {
                metadata[result.filename] = result.type;
                if (result.type.Type == FileType.Link)
                {
                    links.Add(result.filename);
                }
                filenames.Add(result.filename);
            }

            if (links.Count == 0)
            {
                return (filenames, metadata);
            }

            var filteredFilenames = new List<string>(filenames.Count);

            foreach (var filename in filenames)
            {
                var exactLinkIndex = links.FindIndex(link => filename == link);
                var isValid = true;

                for (var i = 0; i < links.Count; i++)
                {
                    if (i == exactLinkIndex)
                    {
                        continue;
                    }

                    var link = links[i];
                    var isFileWithinSymlinkDir = filename.StartsWith(link, StringComparison.OrdinalIgnoreCase);
                    var relativePath = Extensions.GetRelativePath(link, Path.GetDirectoryName(filename) ?? string.Empty);

                    if (isFileWithinSymlinkDir && !relativePath.StartsWith("..", StringComparison.Ordinal))
                    {
                        isValid = false;
                        break;
                    }
                }

                if (isValid)
                {
                    filteredFilenames.Add(filename);
                }
            }

            return (filteredFilenames, metadata);
        }

        // (File order is not important!!!)
        public static List<string> CrawlIterative(string dir)
        {
            var result = new List<string>();
            var stack = new Stack<string>();

 
            string basePath = Extensions.GetBasePath(dir);

            if (!Directory.Exists(basePath))
                return result;

            // Add only the base directory to the stack, but not to the result
            stack.Push(basePath);

            while (stack.Count > 0)
            {
                string currentDir = stack.Pop();

                try
                {
                    // Add all files from the current directory
                    result.AddRange(Directory.GetFiles(currentDir, "*", SearchOption.TopDirectoryOnly));

                    // Add subdirectories to the results and to the stack
                    foreach (var directory in Directory.GetDirectories(currentDir, "*",
                                 SearchOption.TopDirectoryOnly))
                    {
                        // Add subdirectories to the result
                        if (directory != basePath) // Do not add a base directory
                        {
                            result.Add(directory);
                        }

                        // Add to the stack for processing
                        stack.Push(directory);
                    }
                }
                catch (UnauthorizedAccessException)
                {
                    // Skip directories to which there is no access
                    continue;
                }
            }
            

            return result;
        }
    }
}