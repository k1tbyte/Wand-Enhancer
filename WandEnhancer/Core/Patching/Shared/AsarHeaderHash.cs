using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace WandEnhancer.Core.Patching.Shared
{
    /// <summary>
    /// Computes the SHA256 Electron's own asar-integrity fuse expects for an archive: the hash
    /// of the archive's header blob (a length-prefixed JSON pickle), not of the whole file.
    /// </summary>
    internal static class AsarHeaderHash
    {
        private const uint MaxHeaderSize = 64 * 1024 * 1024;

        /// <returns>Lowercase hex SHA256 of the asar header.</returns>
        public static string Compute(string asarPath)
        {
            using (var stream = new FileStream(asarPath, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                byte[] pickleHeader = new byte[16];
                ReadFull(stream, pickleHeader, 0, pickleHeader.Length);

                uint sentinel = BitConverter.ToUInt32(pickleHeader, 0);
                uint payloadSize = BitConverter.ToUInt32(pickleHeader, 4);
                uint stringFieldSize = BitConverter.ToUInt32(pickleHeader, 8);
                uint headerLength = BitConverter.ToUInt32(pickleHeader, 12);

                if (sentinel != 4 || payloadSize < 8 || stringFieldSize != payloadSize - 4 ||
                    headerLength > stringFieldSize - 4 || headerLength > MaxHeaderSize ||
                    16L + headerLength > stream.Length)
                {
                    throw new InvalidDataException($"The ASAR header in {Path.GetFileName(asarPath)} is invalid.");
                }

                byte[] header = new byte[headerLength];
                ReadFull(stream, header, 0, header.Length);

                using (SHA256 sha = SHA256.Create())
                {
                    return ToHex(sha.ComputeHash(header));
                }
            }
        }

        private static void ReadFull(Stream stream, byte[] buffer, int offset, int count)
        {
            while (count > 0)
            {
                int read = stream.Read(buffer, offset, count);
                if (read == 0)
                {
                    throw new EndOfStreamException();
                }

                offset += read;
                count -= read;
            }
        }

        private static string ToHex(byte[] bytes)
        {
            var builder = new StringBuilder(bytes.Length * 2);
            foreach (byte b in bytes)
            {
                builder.Append(b.ToString("x2"));
            }

            return builder.ToString();
        }
    }
}
