using System;
using System.Collections.Generic;
using System.IO;
using AsarSharp.PickleTools;
using AsarSharp.Utils;
using Newtonsoft.Json;

namespace AsarSharp.AsarFileSystem
{
    public static class Disk
    {
        private const int StreamBufferSize = 1024 * 1024;
        private static Dictionary<string, Filesystem> _filesystemCache = new Dictionary<string, Filesystem>();

        public class ArchiveHeader
        {
            public FilesystemEntry Header { get; set; }
            public string HeaderString { get; set; }
            public int HeaderSize { get; set; }
        }

        public class FilesystemFilesAndLinks
        {
            public List<BasicFileInfo> Files { get; set; } = new List<BasicFileInfo>();
            public List<BasicFileInfo> Links { get; set; } = new List<BasicFileInfo>();
        }

        public class BasicFileInfo
        {
            public string Filename { get; set; }
            public bool Unpack { get; set; }
        }
        
        
        #region Reading
        
        public static ArchiveHeader ReadArchiveHeaderSync(string archivePath)
        {
            using (var fs = new FileStream(archivePath, FileMode.Open, FileAccess.Read, FileShare.Read, StreamBufferSize, FileOptions.SequentialScan))
            { 
                // read the size of the header (8 bytes)
                byte[] sizeBuf = new byte[8];
                if (fs.Read(sizeBuf, 0, 8) != 8)
                {
                    throw new Exception("Unable to read header size");
                }
                
                var sizePickle = Pickle.CreateFromBuffer(sizeBuf);
                var size = sizePickle.CreateIterator().ReadUInt32();
                
                // Read the header of the specified size
                var headerBuf = new byte[size];
                if(fs.Read(headerBuf, 0, (int)size) != size)
                {
                    throw new Exception("Unable to read header");
                }
                
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
        public static Filesystem ReadFilesystemSync(string archivePath)
        {
            if (!_filesystemCache.ContainsKey(archivePath) || _filesystemCache[archivePath] == null)
            {
                ArchiveHeader header = ReadArchiveHeaderSync(archivePath);
                Filesystem filesystem = new Filesystem(archivePath);
                filesystem.SetHeader(header.Header, header.HeaderSize);
                _filesystemCache[archivePath] = filesystem;
            }
            
            return _filesystemCache[archivePath];
        }
        
        public static byte[] ReadFileSync(Filesystem filesystem, string filename, FilesystemEntry info)
        {
            if (!info.IsFile || !info.Size.HasValue)
            {
                throw new ArgumentException("Entry is not a file", nameof(info));
            }

            long size = info.Size.Value;
            byte[] buffer = new byte[size];
            
            if (size <= 0)
            {
                return buffer;
            }
            
            if (info.Unpacked == true)
            {
                // It's an unpacked file, read it directly
                string filePath = Path.Combine($"{filesystem.GetRootPath()}.unpacked", filename);
                return File.ReadAllBytes(filePath);
            }

            // Read from the ASAR archive
            using (var fs = new FileStream(filesystem.GetRootPath(), FileMode.Open, FileAccess.Read, FileShare.Read, StreamBufferSize, FileOptions.SequentialScan))
            {
                // Important: the offset must take into account the size of the Pickle header (8 bytes)
                // and the size of the header itself
                long offset = 8 + filesystem.GetHeaderSize() + long.Parse(info.Offset);
                fs.Position = offset;
                    
                // Read the whole file at once
                int bytesRead = fs.Read(buffer, 0, (int)size);
                if (bytesRead != size)
                {
                    throw new Exception($"Failed to read entire file, got {bytesRead} bytes instead of {size}");
                }
            }
            
            
            return buffer;
        }
        
        #endregion
        
        public static bool UncacheFilesystem(string archivePath)
        {
            if (_filesystemCache.ContainsKey(archivePath))
            {
                _filesystemCache.Remove(archivePath);
                return true;
            }
            
            return false;
        }

        public static void UncacheAll()
        {
            _filesystemCache.Clear();
        }
        
        public static void CopyFile(string dest, string rootPath, string filename)
        {
            if(dest == null || rootPath == null || filename == null)
                throw new ArgumentNullException();

            string normalizedDestRoot = Path.GetFullPath(dest)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string normalizedRootPath = Path.GetFullPath(rootPath)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

            if (string.Equals(normalizedDestRoot, normalizedRootPath, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
            
            string sourcePath = Path.GetFullPath(Path.Combine(rootPath, filename));
            string destPath = Path.GetFullPath(Path.Combine(dest, filename));

            if (string.Equals(sourcePath, destPath, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(destPath) ?? throw new InvalidOperationException());
            using (var sourceStream = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read, StreamBufferSize, FileOptions.SequentialScan))
            using (var destinationStream = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None, StreamBufferSize, FileOptions.SequentialScan))
            {
                sourceStream.CopyTo(destinationStream, StreamBufferSize);
            }
        }
        

        public static void WriteFileSystem(string dest, Filesystem fileSystem,
            FilesystemFilesAndLinks lists,
            Dictionary<string, CrawledFileType> metadata)
        {
            var fsHeader = fileSystem.GetHeader();
            var headerPickle = Pickle.CreateEmpty();
            var serializerSettings = new JsonSerializerSettings()
                { NullValueHandling = NullValueHandling.Ignore, DefaultValueHandling = DefaultValueHandling.Ignore } ;

            var headerJson = JsonConvert.SerializeObject(fsHeader,serializerSettings);
            headerPickle.WriteString(headerJson);
            var headerBuf = headerPickle.ToBuffer();
            
            var sizePickle = Pickle.CreateEmpty();
            sizePickle.WriteUInt32((uint)headerBuf.Length);
            var sizeBuf = sizePickle.ToBuffer();
            
            using (var fs = new FileStream(dest, FileMode.Create, FileAccess.Write, FileShare.None, StreamBufferSize, FileOptions.SequentialScan))
            {
                fs.Write(sizeBuf, 0, sizeBuf.Length);
                fs.Write(headerBuf, 0, headerBuf.Length);
                
                foreach (var file in lists.Files)
                {
                    if (file.Unpack)
                    {
                        var filename = Extensions.GetRelativePath(fileSystem.GetRootPath(), file.Filename);
                        CopyFile($"{dest}.unpacked", fileSystem.GetRootPath(), filename);
                        continue;
                    }
                    using (var transformedFileStream = new FileStream(file.Filename, FileMode.Open, FileAccess.Read, FileShare.Read, StreamBufferSize, FileOptions.SequentialScan))
                    {
                        transformedFileStream.CopyTo(fs, StreamBufferSize);
                    }
                }
            }
        }
    }
}