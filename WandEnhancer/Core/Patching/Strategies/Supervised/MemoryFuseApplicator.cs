using System;
using System.Runtime.InteropServices;
using WandEnhancer.Core.Patching.Shared;

namespace WandEnhancer.Core.Patching.Strategies.Supervised
{
    internal sealed class MemoryFuseApplicator : IFuseApplicator
    {
        /// <summary>Clears the fuse in a running process.</summary>
        /// <param name="imageBaseHint">
        /// Where the same image sits in a process already known to us, or zero. Windows draws an
        /// image base once per boot per file rather than per process, so every Electron child
        /// shares the base of the main process - which is readable because we create it suspended.
        /// Trying that address first keeps the child's own PEB out of the path, and the PEB is
        /// exactly what antivirus handle filtering takes away. The sentinel check below is what
        /// makes the guess safe to act on.
        /// </param>
        public bool ClearIn(IntPtr process, long stateRva, IntPtr imageBaseHint, out string problem)
        {
            problem = null;
            if (imageBaseHint != IntPtr.Zero && TryClearAt(process, imageBaseHint, stateRva, out problem))
            {
                return true;
            }

            IntPtr imageBase = ProcessInfo.GetImageBase(process, out string unreadable);
            if (imageBase == IntPtr.Zero)
            {
                // Both doors shut is a different diagnosis from either one, and it is the one that
                // says a filter is sitting between us and the process rather than a timing problem.
                problem = problem == null ? unreadable : $"{problem}; {unreadable}";
                return false;
            }

            // Equal means the hint above already tried it, and problem says how that went.
            return imageBase != imageBaseHint && TryClearAt(process, imageBase, stateRva, out problem);
        }

        private static bool TryClearAt(IntPtr process, IntPtr imageBase, long stateRva, out string problem)
        {
            problem = null;
            var block = new byte[ElectronFuseWire.MatchLength];
            var start = new IntPtr(imageBase.ToInt64() + stateRva - ElectronFuseWire.StateFromSentinel);

            if (!ReadProcessMemory(process, start, block, (UIntPtr)block.Length, out UIntPtr read) || (ulong)read != (ulong)block.Length)
            {
                problem = $"its memory could not be read ({Win32Error.Describe(Marshal.GetLastWin32Error())})";
                return false;
            }

            // Validate the fuse block in process memory to prevent overwriting unrelated memory after an update.
            if (!ElectronFuseWire.BlockLooksValid(block, 0))
            {
                problem = "the fuse block is not where the file on disk said it would be";
                return false;
            }

            if (block[ElectronFuseWire.StateFromSentinel] == ElectronFuseWire.StateRemoved)
            {
                return true;
            }

            var target = new IntPtr(imageBase.ToInt64() + stateRva);
            if (!VirtualProtectEx(process, target, (UIntPtr)1, PAGE_READWRITE, out uint previous))
            {
                problem = $"the page could not be made writable ({Win32Error.Describe(Marshal.GetLastWin32Error())})";
                return false;
            }

            bool written = WriteProcessMemory(process, target, new[] { ElectronFuseWire.StateRemoved }, (UIntPtr)1, out _);
            if (!written)
            {
                // Preserve the error before restoring memory protection.
                problem = $"the write was refused ({Win32Error.Describe(Marshal.GetLastWin32Error())})";
            }

            VirtualProtectEx(process, target, (UIntPtr)1, previous, out _);
            return written;
        }

        #region P/Invoke

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
