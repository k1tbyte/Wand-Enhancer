using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using Newtonsoft.Json;

namespace AsarSharp.Integrity
{
    public static class IntegrityHelper
    {
        private const string ALGORITHM = "SHA256";
        private const int BLOCK_SIZE = 4 * 1024 * 1024;
        public const string PLACEHOLDER_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
        private static readonly char[] HexDigits = "0123456789abcdef".ToCharArray();

        public class FileIntegrity
        {
            [JsonProperty("algorithm")]
            public string Algorithm { get; set; }

            [JsonProperty("hash")]
            public string Hash { get; set; }

            [JsonProperty("blockSize")]
            public int BlockSize { get; set; }

            [JsonProperty("blocks")]
            public List<string> Blocks { get; set; }
        }

        public static FileIntegrity CreatePlaceholder(long fileSize)
        {
            int blockCount = fileSize > 0 ? (int)((fileSize + BLOCK_SIZE - 1) / BLOCK_SIZE) : 0;
            var blocks = new List<string>(blockCount);
            for (int i = 0; i < blockCount; i++)
                blocks.Add(PLACEHOLDER_HASH);

            return new FileIntegrity
            {
                Algorithm = ALGORITHM,
                Hash = PLACEHOLDER_HASH,
                BlockSize = BLOCK_SIZE,
                Blocks = blocks,
            };
        }

        public static FileIntegrity GetFileIntegrity(string path, byte[] reusableBuffer = null)
        {
            bool ownBuffer = reusableBuffer == null;
            if (ownBuffer) reusableBuffer = new byte[BLOCK_SIZE];

            using (var fileStream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
                       65536, FileOptions.SequentialScan))
            using (var fileHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256))
            using (var blockHash = SHA256.Create())
            {
                int estimatedBlockCount = fileStream.Length > 0
                    ? (int)((fileStream.Length + BLOCK_SIZE - 1) / BLOCK_SIZE)
                    : 0;
                var blockHashes = new List<string>(estimatedBlockCount);
                int bytesRead;

                while ((bytesRead = fileStream.Read(reusableBuffer, 0, reusableBuffer.Length)) > 0)
                {
                    blockHashes.Add(ToLowerHex(blockHash.ComputeHash(reusableBuffer, 0, bytesRead)));
                    fileHash.AppendData(reusableBuffer, 0, bytesRead);
                }

                return new FileIntegrity
                {
                    Algorithm = ALGORITHM,
                    Hash = ToLowerHex(fileHash.GetHashAndReset()),
                    BlockSize = BLOCK_SIZE,
                    Blocks = blockHashes,
                };
            }
        }

        public sealed class StreamingHasher : IDisposable
        {
            private readonly IncrementalHash _fileHash;
            private readonly SHA256 _blockHash;
            private readonly byte[] _blockBuf;
            private int _blockFill;
            private readonly List<string> _blockHashes;

            public StreamingHasher(int estimatedBlocks = 0, byte[] sharedBlockBuffer = null)
            {
                _fileHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
                _blockHash = SHA256.Create();
                _blockBuf = sharedBlockBuffer ?? new byte[BLOCK_SIZE];
                _blockFill = 0;
                _blockHashes = new List<string>(estimatedBlocks);
            }

            public void Append(byte[] data, int offset, int count)
            {
                _fileHash.AppendData(data, offset, count);

                int remaining = count;
                int src = offset;
                while (remaining > 0)
                {
                    int space = BLOCK_SIZE - _blockFill;
                    int copy = Math.Min(space, remaining);
                    Buffer.BlockCopy(data, src, _blockBuf, _blockFill, copy);
                    _blockFill += copy;
                    src += copy;
                    remaining -= copy;

                    if (_blockFill == BLOCK_SIZE)
                    {
                        _blockHashes.Add(ToLowerHex(_blockHash.ComputeHash(_blockBuf, 0, BLOCK_SIZE)));
                        _blockFill = 0;
                    }
                }
            }

            public FileIntegrity Finalise()
            {
                if (_blockFill > 0)
                {
                    _blockHashes.Add(ToLowerHex(_blockHash.ComputeHash(_blockBuf, 0, _blockFill)));
                    _blockFill = 0;
                }

                return new FileIntegrity
                {
                    Algorithm = ALGORITHM,
                    Hash = ToLowerHex(_fileHash.GetHashAndReset()),
                    BlockSize = BLOCK_SIZE,
                    Blocks = _blockHashes,
                };
            }

            public void Dispose()
            {
                _fileHash.Dispose();
                _blockHash.Dispose();
            }
        }

        public static string ToLowerHex(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0) return string.Empty;
            var chars = new char[bytes.Length * 2];
            for (int i = 0; i < bytes.Length; i++)
            {
                byte v = bytes[i];
                chars[i * 2] = HexDigits[v >> 4];
                chars[i * 2 + 1] = HexDigits[v & 0x0F];
            }
            return new string(chars);
        }
    }
}
