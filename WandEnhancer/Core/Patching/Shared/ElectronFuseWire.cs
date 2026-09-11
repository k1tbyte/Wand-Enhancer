using System;
using System.IO;
using System.Text;
using AsarSharp.Utils;

namespace WandEnhancer.Core.Patching.Shared
{
    /// <summary>Locates and manages the Electron ASAR integrity fuse state byte.</summary>
    internal static class ElectronFuseWire
    {
        public const byte StateRemoved = (byte)'r';

        public const int SentinelLength = 32;
        private const int WireHeaderLength = 2;
        private const int AsarIntegrityIndex = 4;

        /// <summary>Distance from sentinel start to the ASAR-integrity state byte.</summary>
        public const int StateFromSentinel = SentinelLength + WireHeaderLength + AsarIntegrityIndex;

        /// <summary>Length of span read to validate the sentinel and state byte.</summary>
        public const int MatchLength = StateFromSentinel + 1;

        private const byte SupportedWireVersion = 1;
        private const int MinFuseCount = 5;
        private const int ChunkSize = 1 << 20;

        // Fixed @electron/fuses sentinel string.
        private static readonly byte[] Sentinel =
            Encoding.ASCII.GetBytes("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");

        /// <summary>Gets image-base offset of the state byte for a mapped process.</summary>
        /// <returns>-1 if no fuse block found.</returns>
        public static long FindStateRva(string exePath)
        {
            using (var stream = OpenShared(exePath))
            {
                long offset = FindStateOffset(stream);
                return offset < 0 ? -1 : PeImage.FileOffsetToRva(stream, offset);
            }
        }

        /// <summary>Gets file offset of the state byte for an on-disk patch.</summary>
        /// <returns>-1 if no fuse block found.</returns>
        public static long FindStateFileOffset(string exePath)
        {
            using (var stream = OpenShared(exePath))
            {
                return FindStateOffset(stream);
            }
        }

        /// <summary>Validates fuse block format to prevent writing to unrelated bytes via stale offsets.</summary>
        public static bool BlockLooksValid(byte[] block, int offset)
        {
            return MatchesSentinel(block, offset) &&
                   block[offset + SentinelLength] == SupportedWireVersion &&
                   block[offset + SentinelLength + 1] >= MinFuseCount;
        }

        private static FileStream OpenShared(string exePath)
        {
            // Full sharing: Wand may be running.
            return new FileStream(exePath, FileMode.Open, FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete, ChunkSize, FileOptions.SequentialScan);
        }

        private static long FindStateOffset(Stream stream)
        {
            var buffer = new byte[ChunkSize + MatchLength];
            long bufferStart = 0;
            int filled = 0;

            while (true)
            {
                filled += stream.ReadFull(buffer, filled, buffer.Length - filled);
                if (filled < MatchLength)
                {
                    return -1;
                }

                int limit = filled - MatchLength;
                // Search byte-by-byte (sentinel alignment is not guaranteed by linker).
                for (int i = 0; i <= limit; i++)
                {
                    if (buffer[i] != Sentinel[0] || !BlockLooksValid(buffer, i))
                    {
                        continue;
                    }

                    return bufferStart + i + StateFromSentinel;
                }

                // Stop on EOF short fill.
                if (filled < buffer.Length)
                {
                    return -1;
                }

                Buffer.BlockCopy(buffer, limit, buffer, 0, MatchLength);
                bufferStart += limit;
                filled = MatchLength;
            }
        }

        private static bool MatchesSentinel(byte[] buffer, int offset)
        {
            for (int i = 0; i < SentinelLength; i++)
            {
                if (buffer[offset + i] != Sentinel[i])
                {
                    return false;
                }
            }

            return true;
        }
    }
}
