using System;
using System.IO;
using AsarSharp.Utils;

namespace WandEnhancer.Core.Patching.Shared
{
    /// <summary>Translates PE file offsets to relative virtual addresses (RVAs).</summary>
    internal static class PeImage
    {
        private const int SectionEntrySize = 40;
        private const int PeHeaderLength = 24;
        private const uint PeSignature = 0x00004550;

        /// <summary>Maps a file offset to an offset from the image base.</summary>
        /// <returns>-1 if invalid PE or offset outside all sections.</returns>
        public static long FileOffsetToRva(Stream stream, long fileOffset)
        {
            var head = new byte[4096];
            stream.Position = 0;
            if (stream.ReadFull(head, 0, head.Length) < head.Length)
            {
                return -1;
            }

            int peHeader = BitConverter.ToInt32(head, 0x3C);
            // Guard against hostile e_lfanew overflow.
            if (peHeader < 0 || peHeader > head.Length - PeHeaderLength ||
                BitConverter.ToUInt32(head, peHeader) != PeSignature)
            {
                return -1;
            }

            int sectionCount = BitConverter.ToUInt16(head, peHeader + 6);
            int sectionTable = peHeader + 24 + BitConverter.ToUInt16(head, peHeader + 20);
            if (sectionTable + sectionCount * SectionEntrySize > head.Length)
            {
                return -1;
            }

            for (int i = 0; i < sectionCount; i++)
            {
                int entry = sectionTable + i * SectionEntrySize;
                long virtualAddress = BitConverter.ToUInt32(head, entry + 12);
                long rawSize = BitConverter.ToUInt32(head, entry + 16);
                long rawStart = BitConverter.ToUInt32(head, entry + 20);

                if (fileOffset >= rawStart && fileOffset < rawStart + rawSize)
                {
                    return virtualAddress + (fileOffset - rawStart);
                }
            }

            return -1;
        }
    }
}
