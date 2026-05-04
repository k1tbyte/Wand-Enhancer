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
        // 4MB default block size
        private const int BLOCK_SIZE = 4 * 1024 * 1024;
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

        public static FileIntegrity GetFileIntegrity(string path)
        {
            using (var fileStream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, BLOCK_SIZE, FileOptions.SequentialScan))
            using(var fileHash = SHA256.Create())
            using (var blockHash = SHA256.Create())
            {
                int estimatedBlockCount = fileStream.Length > 0
                    ? (int)((fileStream.Length + BLOCK_SIZE - 1) / BLOCK_SIZE)
                    : 0;
                var blockHashes = new List<string>(estimatedBlockCount);
                var buffer = new byte[BLOCK_SIZE];
                int bytesRead;

                while ((bytesRead = fileStream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    blockHashes.Add(HashBlock(blockHash, buffer, bytesRead));
                    fileHash.TransformBlock(buffer, 0, bytesRead, null, 0);
                }

                fileHash.TransformFinalBlock(Array.Empty<byte>(), 0, 0);

                return new FileIntegrity
                {
                    Algorithm = ALGORITHM,
                    Hash = ToLowerHex(fileHash.Hash),
                    BlockSize = BLOCK_SIZE,
                    Blocks = blockHashes,
                };
            }
        }

        private static string HashBlock(HashAlgorithm hashAlgorithm, byte[] buffer, int bytesRead)
        {
            return ToLowerHex(hashAlgorithm.ComputeHash(buffer, 0, bytesRead));
        }

        private static string ToLowerHex(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0)
            {
                return string.Empty;
            }

            var chars = new char[bytes.Length * 2];
            for (int index = 0; index < bytes.Length; index++)
            {
                byte value = bytes[index];
                chars[index * 2] = HexDigits[value >> 4];
                chars[index * 2 + 1] = HexDigits[value & 0x0F];
            }

            return new string(chars);
        }
    }
}