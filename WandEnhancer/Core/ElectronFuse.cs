using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using AsarSharp.Utils;

namespace WandEnhancer.Core
{
    /// <summary>
    /// Electron fuse wire: 32-byte sentinel + [version][fuseCount][state per fuse].
    /// Clearing the ASAR integrity fuse allows loading a patched app.asar.
    /// </summary>
    internal static class ElectronFuse
    {
        private const int AsarIntegrityIndex = 4;
        private const byte StateRemoved = (byte)'r';
        private const byte SupportedWireVersion = 1;
        private const int MinFuseCount = 5;
        private const int SentinelLength = 32;
        private const int WireHeaderLength = 2;
        private const int StateFromSentinel = SentinelLength + WireHeaderLength + AsarIntegrityIndex;
        private const int MatchLength = StateFromSentinel + 1;
        private const int ChunkSize = 1 << 20;

        private static readonly byte[] Sentinel =
            Encoding.ASCII.GetBytes("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");

        /// <summary>
        /// Gets fuse state offset from image base. Scanned once from disk.
        /// </summary>
        /// <returns>-1 when the file carries no fuse block.</returns>
        public static long FindStateRva(string exePath)
        {
            // Share everything: Wand is normally already running when this is asked again.
            using (var stream = new FileStream(exePath, FileMode.Open, FileAccess.Read,
                       FileShare.ReadWrite | FileShare.Delete, ChunkSize, FileOptions.SequentialScan))
            {
                long offset = FindStateOffset(stream);
                return offset < 0 ? -1 : ToRva(stream, offset);
            }
        }

        /// <summary>Clears the fuse in a running process.</summary>
        public static bool ClearIn(IntPtr process, long stateRva, out string problem)
        {
            problem = null;
            IntPtr imageBase = ProcessInfo.GetImageBase(process);
            if (imageBase == IntPtr.Zero)
            {
                problem = "it has no image base yet";
                return false;
            }

            var block = new byte[MatchLength];
            var start = new IntPtr(imageBase.ToInt64() + stateRva - StateFromSentinel);

            if (!ReadProcessMemory(process, start, block, (UIntPtr)block.Length, out UIntPtr read) || (ulong)read != (ulong)block.Length)
            {
                problem = $"its memory could not be read (win32 error {Marshal.GetLastWin32Error()})";
                return false;
            }

            // Validate sentinel in process memory to prevent overwriting unrelated memory after an update.
            if (!MatchesSentinel(block, 0) ||
                block[SentinelLength] != SupportedWireVersion ||
                block[SentinelLength + 1] < MinFuseCount)
            {
                problem = "the fuse block is not where the file on disk said it would be";
                return false;
            }

            if (block[StateFromSentinel] == StateRemoved)
            {
                return true;
            }

            var target = new IntPtr(imageBase.ToInt64() + stateRva);
            if (!VirtualProtectEx(process, target, (UIntPtr)1, PAGE_READWRITE, out uint previous))
            {
                problem = $"the page could not be made writable (win32 error {Marshal.GetLastWin32Error()})";
                return false;
            }

            bool written = WriteProcessMemory(process, target, new[] { StateRemoved }, (UIntPtr)1, out _);
            if (!written)
            {
                // Preserve the error before restoring memory protection.
                problem = $"the write was refused (win32 error {Marshal.GetLastWin32Error()})";
            }

            VirtualProtectEx(process, target, (UIntPtr)1, previous, out _);
            return written;
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
                // Byte by byte: the linker is free to place the sentinel at any alignment.
                for (int i = 0; i <= limit; i++)
                {
                    if (buffer[i] != Sentinel[0] || !MatchesSentinel(buffer, i))
                    {
                        continue;
                    }

                    int wire = i + SentinelLength;
                    if (buffer[wire] != SupportedWireVersion || buffer[wire + 1] < MinFuseCount)
                    {
                        continue;
                    }

                    return bufferStart + i + StateFromSentinel;
                }

                // A short fill is end of file, and a tail shorter than a match cannot hold one.
                if (filled < buffer.Length)
                {
                    return -1;
                }

                Buffer.BlockCopy(buffer, limit, buffer, 0, MatchLength);
                bufferStart += limit;
                filled = MatchLength;
            }
        }

        /// <summary>Maps a file offset through the section table to an offset from the image base.</summary>
        private static long ToRva(Stream stream, long fileOffset)
        {
            var head = new byte[4096];
            stream.Position = 0;
            if (stream.ReadFull(head, 0, head.Length) < head.Length)
            {
                return -1;
            }

            int peHeader = BitConverter.ToInt32(head, 0x3C);
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

        #region P/Invoke

        private const int SectionEntrySize = 40;
        private const uint PAGE_READWRITE = 0x04;

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ReadProcessMemory(
            IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, UIntPtr dwSize, out UIntPtr lpNumberOfBytesRead);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WriteProcessMemory(
            IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, UIntPtr dwSize, out UIntPtr lpNumberOfBytesWritten);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool VirtualProtectEx(
            IntPtr hProcess, IntPtr lpAddress, UIntPtr dwSize, uint flNewProtect, out uint lpflOldProtect);

        #endregion
    }
}
