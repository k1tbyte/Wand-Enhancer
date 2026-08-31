using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using AsarSharp.Utils;

namespace WandEnhancer.Core
{
    /// <summary>
    /// Electron's fuse wire: a 32-byte sentinel followed by [version][fuseCount][state per fuse].
    /// Clearing the ASAR integrity fuse is what lets a patched app.asar load at all - the archive
    /// no longer hashes to the value baked into the executable, and a process that opens it with
    /// the fuse still set exits with -36861.
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
        /// Offset of the fuse state from the image base, read once from the file on disk. Every
        /// process started from that file maps it at the same offset, so the scan is not repeated
        /// per process - reading 200+ MB out of each one would not fit in the second we have
        /// before Electron opens the archive.
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

        /// <summary>
        /// Clears the fuse in a running process.
        /// </summary>
        /// <param name="problem">
        /// Why it did not happen, phrased for the log. Every failure here reaches a user as
        /// "Wand opens but nothing works", and a bare false leaves nobody anything to act on.
        /// </param>
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

            if (!ReadProcessMemory(process, start, block, block.Length, out int read) || read != block.Length)
            {
                problem = $"its memory could not be read (win32 error {Marshal.GetLastWin32Error()})";
                return false;
            }

            // The sentinel is checked again inside the process: a Wand update swaps the
            // executable under a running launcher, and a stale offset would otherwise put a
            // byte into unrelated memory.
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

            bool written = WriteProcessMemory(process, target, new[] { StateRemoved }, 1, out _);
            if (!written)
            {
                // Taken before the protection is restored, which would overwrite the error.
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
            IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, int dwSize, out int lpNumberOfBytesRead);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WriteProcessMemory(
            IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, int dwSize, out int lpNumberOfBytesWritten);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool VirtualProtectEx(
            IntPtr hProcess, IntPtr lpAddress, UIntPtr dwSize, uint flNewProtect, out uint lpflOldProtect);

        #endregion
    }
}
