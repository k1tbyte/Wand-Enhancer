using System;
using System.Collections.Generic;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using WandEnhancer.View.MainWindow;

namespace WandEnhancer.Core
{
    /// <summary>
    /// Launches Electron under a startup-only debugger and clears the ASAR integrity
    /// fuse in every process it spawns (main, renderer, gpu, utility). Electron respawns
    /// children from its own on-disk exe where the fuse is still enabled, so patching only
    /// the main process leaves renderers crashing with -36861. The debugger stops each child
    /// at creation, so there is no race, and memory patching is immune to Chromium's sandbox
    /// DLL-signature mitigations. We detach once the window is up - long before any game
    /// launch - so game anti-debug/DRM is never exposed to a debugger.
    /// </summary>
    internal static class FuseLauncher
    {
        private const int FuseAsarIntegrity = 4;
        private const byte FuseStateRemoved = (byte)'r';
        private const int SentinelLength = 32;
        private const int ScanChunkSize = 0x100000;

        // Electron's fuse wire follows the sentinel: [version][fuseCount][state per fuse].
        private const int FuseWireVersionOffset = 0;
        private const int FuseWireCountOffset = 1;
        private const int FuseWireStatesOffset = 2;
        private const byte FuseWireSupportedVersion = 1;
        private const int FuseWireMinCount = 5;
        // Longest tail read past a sentinel hit: version + count + the fuse we edit.
        private const int FuseWireTailBytes = FuseWireStatesOffset + FuseAsarIntegrity + 1;

        // x64 DEBUG_EVENT: dwDebugEventCode, dwProcessId, dwThreadId, 4 bytes padding,
        // then the union. CREATE_PROCESS_DEBUG_INFO starts with hFile, hProcess, hThread,
        // lpBaseOfImage; EXCEPTION_DEBUG_INFO starts with the exception code.
        private const int DebugEventSize = 192;
        private const int OffsetDebugEventCode = 0;
        private const int OffsetProcessId = 4;
        private const int OffsetThreadId = 8;
        private const int OffsetUnion = 16;
        private const int OffsetExceptionCode = OffsetUnion;
        // EXCEPTION_DEBUG_INFO is EXCEPTION_RECORD (152 bytes on x64) followed by dwFirstChance.
        private const int OffsetExceptionFirstChance = OffsetUnion + 152;
        private const int OffsetExitCode = OffsetUnion;
        private const int OffsetCreateProcessFile = OffsetUnion;
        private const int OffsetCreateProcessHandle = OffsetUnion + 8;
        private const int OffsetCreateProcessImageBase = OffsetUnion + 24;

        // Detach after the startup process burst settles (all children spawned and patched),
        // capped hard so we never linger into gameplay.
        private const long MinDebugMs = 3000;
        private const long QuietMs = 1500;
        private const long MaxDebugMs = 9000;

        // Electron dies a second or two after a renderer fails, which is past the detach.
        // Watching that window is the only way the exit code reaches the log.
        private const int PostDetachWatchMs = 5000;
        
        private const int AsarIntegrityExitCode = -36861;

        private static readonly byte[] Sentinel =
            Encoding.ASCII.GetBytes("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");

        public static bool Launch(string exePath, string args, Action<string, ELogType> log = null)
        {
            var si = new STARTUPINFO { cb = Marshal.SizeOf<STARTUPINFO>() };
            var cmdLine = new StringBuilder(
                string.IsNullOrEmpty(args) ? $"\"{exePath}\"" : $"\"{exePath}\" {args}");

            if (!CreateProcessW(null, cmdLine, IntPtr.Zero, IntPtr.Zero,
                    false, DEBUG_PROCESS, IntPtr.Zero,
                    Path.GetDirectoryName(exePath), ref si, out var pi))
            {
                log?.Invoke($"Could not start Wand under the fuse patcher (win32 error {Marshal.GetLastWin32Error()}).",
                    ELogType.Error);
                return false;
            }

            // Debugged processes must survive after we detach and exit.
            DebugSetProcessKillOnExit(false);
            CloseHandle(pi.hThread);
            log?.Invoke($"Started {exePath} as pid {pi.dwProcessId}.", ELogType.Info);

            try
            {
                // The process handle outlives the debug loop on purpose: once detached it is
                // the only remaining way to read why Wand died.
                if (!DrivePatchingDebugLoop(pi.dwProcessId, log))
                {
                    WatchAfterDetach(pi.hProcess, log);
                }
            }
            finally
            {
                CloseHandle(pi.hProcess);
            }

            return true;
        }

        /// <returns>True when the main process exited while the debugger was still attached.</returns>
        private static bool DrivePatchingDebugLoop(int mainPid, Action<string, ELogType> log)
        {
            var pids = new List<int>();
            var brokeIn = new HashSet<int>();
            var evt = new byte[DebugEventSize];
            // Stopwatch, not TickCount: TickCount is a 32-bit millisecond counter that wraps
            // every ~25 days, and a negative elapsed would keep the debugger attached forever.
            var clock = Stopwatch.StartNew();
            long lastCreate = 0;
            int created = 0;
            int patched = 0;

            while (true)
            {
                long now = clock.ElapsedMilliseconds;

                if (!WaitForDebugEvent(evt, 200))
                {
                    if (ShouldDetach(now, now - lastCreate)) break;
                    continue;
                }

                int code = BitConverter.ToInt32(evt, OffsetDebugEventCode);
                int pid = BitConverter.ToInt32(evt, OffsetProcessId);
                int tid = BitConverter.ToInt32(evt, OffsetThreadId);
                uint status = DBG_CONTINUE;

                switch (code)
                {
                    case CREATE_PROCESS_DEBUG_EVENT:
                        var hFile = (IntPtr)BitConverter.ToInt64(evt, OffsetCreateProcessFile);
                        var hProc = (IntPtr)BitConverter.ToInt64(evt, OffsetCreateProcessHandle);
                        var baseImg = (IntPtr)BitConverter.ToInt64(evt, OffsetCreateProcessImageBase);
                        if (!pids.Contains(pid)) pids.Add(pid);
                        created++;
                        bool cleared = PatchFuse(hProc, baseImg);
                        if (cleared) patched++;
                        log?.Invoke(
                            $"pid {pid} started at {now} ms - fuse " +
                            (cleared ? "cleared." : $"NOT cleared, it may exit with {AsarIntegrityExitCode}."),
                            cleared ? ELogType.Info : ELogType.Warn);
                        // The debugger owns the image handle the kernel hands over with this event.
                        if (hFile != IntPtr.Zero) CloseHandle(hFile);
                        lastCreate = now;
                        break;

                    case EXCEPTION_DEBUG_EVENT:
                        int exCode = BitConverter.ToInt32(evt, OffsetExceptionCode);
                        // Pass the one-shot startup breakpoint, let the app own the rest.
                        status = (exCode == EXCEPTION_BREAKPOINT && brokeIn.Add(pid))
                            ? DBG_CONTINUE
                            : DBG_EXCEPTION_NOT_HANDLED;
                        // Chromium raises first-chance exceptions constantly and handles them.
                        // A second chance means nothing handled it and the process is dying.
                        if (BitConverter.ToInt32(evt, OffsetExceptionFirstChance) == 0)
                            log?.Invoke($"pid {pid} hit an unhandled exception at {now} ms: {DescribeCode(exCode)}.",
                                ELogType.Error);
                        break;

                    case EXIT_PROCESS_DEBUG_EVENT:
                        int exitCode = BitConverter.ToInt32(evt, OffsetExitCode);
                        pids.Remove(pid);
                        log?.Invoke(
                            $"{(pid == mainPid ? "Main process" : $"pid {pid}")} exited at {now} ms " +
                            $"with code {DescribeCode(exitCode)}.",
                            exitCode == 0 ? ELogType.Info : ELogType.Error);

                        if (pid == mainPid)
                        {
                            log?.Invoke($"Wand exited during startup: {created} processes started, {patched} fuse-patched.",
                                ELogType.Error);
                            ContinueDebugEvent(pid, tid, status);
                            return true;
                        }
                        break;
                }

                ContinueDebugEvent(pid, tid, status);

                now = clock.ElapsedMilliseconds;
                if (ShouldDetach(now, now - lastCreate))
                    break;
            }

            long detachedAt = clock.ElapsedMilliseconds;
            // The detach reason matters: hitting the cap means Electron was still spawning
            // processes we never patched, which looks exactly like "Wand does not open".
            string reason = detachedAt > MaxDebugMs
                ? $"{MaxDebugMs} ms cap reached"
                : $"no new process for {QuietMs} ms";
            log?.Invoke(
                $"Detached after {detachedAt} ms ({reason}): {created} processes started, " +
                $"{patched} fuse-patched, {pids.Count} still attached.",
                patched == 0 ? ELogType.Error : ELogType.Info);

            foreach (var pid in pids)
                DebugActiveProcessStop(pid);

            return false;
        }

        /// <summary>
        /// Electron usually dies a second or two after a renderer fails, which lands after the
        /// detach. Without this the log ends on a healthy-looking "detached" line.
        /// </summary>
        private static void WatchAfterDetach(IntPtr hProcess, Action<string, ELogType> log)
        {
            if (WaitForSingleObject(hProcess, PostDetachWatchMs) != WAIT_OBJECT_0)
            {
                log?.Invoke($"Wand still running {PostDetachWatchMs} ms after detach.", ELogType.Success);
                return;
            }

            if (!GetExitCodeProcess(hProcess, out int exitCode))
            {
                log?.Invoke($"Wand exited after detach, exit code unreadable (win32 error {Marshal.GetLastWin32Error()}).",
                    ELogType.Error);
                return;
            }

            log?.Invoke($"Wand exited right after detach with code {DescribeCode(exitCode)}.", ELogType.Error);
        }


        private static string DescribeCode(int code)
        {
            switch (code)
            {
                case 0: return "0";
                case AsarIntegrityExitCode:
                    return $"{code} (ASAR integrity check failed - the fuse was not cleared in that process)";
                case unchecked((int)0xC0000005): return $"0x{code:X8} (access violation)";
                case unchecked((int)0xC0000135): return $"0x{code:X8} (a required DLL is missing)";
                case unchecked((int)0xC0000142): return $"0x{code:X8} (a DLL failed to initialise)";
                case unchecked((int)0xC0000409): return $"0x{code:X8} (stack buffer overrun)";
                default: return $"{code} (0x{code:X8})";
            }
        }

        private static bool ShouldDetach(long elapsed, long sinceLastCreate)
        {
            if (elapsed > MaxDebugMs) return true;
            return elapsed > MinDebugMs && sinceLastCreate > QuietMs;
        }

        private static bool PatchFuse(IntPtr hProcess, IntPtr imageBase)
        {
            if (imageBase == IntPtr.Zero) return false;

            int sizeOfImage = ReadSizeOfImage(hProcess, imageBase);
            if (sizeOfImage == 0) return false;

            const int overlap = 64;
            var buffer = new byte[ScanChunkSize + overlap];

            for (long offset = 0; offset < sizeOfImage; offset += ScanChunkSize)
            {
                int toRead = (int)Math.Min(ScanChunkSize + overlap, sizeOfImage - offset);
                if (toRead < SentinelLength + FuseWireTailBytes) break;

                var addr = new IntPtr(imageBase.ToInt64() + offset);
                if (!ReadProcessMemory(hProcess, addr, buffer, toRead, out int bytesRead))
                    continue;
                if (bytesRead < SentinelLength + FuseWireTailBytes) continue;

                int limit = bytesRead - SentinelLength - FuseWireTailBytes;
                // Byte-by-byte: the linker is free to place the sentinel at any alignment,
                // and a miss means every renderer dies with -36861.
                for (int i = 0; i <= limit; i++)
                {
                    if (buffer[i] != Sentinel[0] || !MatchesSentinel(buffer, i)) continue;

                    int wireOffset = i + SentinelLength;
                    if (buffer[wireOffset + FuseWireVersionOffset] != FuseWireSupportedVersion ||
                        buffer[wireOffset + FuseWireCountOffset] < FuseWireMinCount) continue;

                    int fusePos = wireOffset + FuseWireStatesOffset + FuseAsarIntegrity;
                    if (buffer[fusePos] == FuseStateRemoved) return true;

                    var target = new IntPtr(imageBase.ToInt64() + offset + fusePos);
                    VirtualProtectEx(hProcess, target, (UIntPtr)1, PAGE_READWRITE, out uint oldProt);
                    bool ok = WriteProcessMemory(hProcess, target, new[] { FuseStateRemoved }, 1, out _);
                    VirtualProtectEx(hProcess, target, (UIntPtr)1, oldProt, out _);
                    return ok;
                }
            }

            return false;
        }

        private static bool MatchesSentinel(byte[] buffer, int offset)
        {
            for (int j = 1; j < SentinelLength; j++)
                if (buffer[offset + j] != Sentinel[j]) return false;
            return true;
        }

        private static int ReadSizeOfImage(IntPtr hProcess, IntPtr imageBase)
        {
            var dosHeader = new byte[64];
            if (!ReadProcessMemory(hProcess, imageBase, dosHeader, 64, out _))
                return 0;

            int peOffset = BitConverter.ToInt32(dosHeader, 0x3C);
            var buf = new byte[4];
            // SizeOfImage sits at optional-header offset 56 (PE signature + COFF header = 24).
            var addr = new IntPtr(imageBase.ToInt64() + peOffset + 80);
            if (!ReadProcessMemory(hProcess, addr, buf, 4, out _))
                return 0;

            return BitConverter.ToInt32(buf, 0);
        }

        #region P/Invoke

        private const uint DEBUG_PROCESS = 0x1;
        private const uint PAGE_READWRITE = 0x04;
        private const uint DBG_CONTINUE = 0x00010002;
        private const uint DBG_EXCEPTION_NOT_HANDLED = 0x80010001;
        private const int EXCEPTION_DEBUG_EVENT = 1;
        private const int CREATE_PROCESS_DEBUG_EVENT = 3;
        private const int EXIT_PROCESS_DEBUG_EVENT = 5;
        private const int EXCEPTION_BREAKPOINT = unchecked((int)0x80000003);
        private const uint WAIT_OBJECT_0 = 0;

        [StructLayout(LayoutKind.Sequential)]
        private struct STARTUPINFO
        {
            public int cb;
            public IntPtr lpReserved, lpDesktop, lpTitle;
            public int dwX, dwY, dwXSize, dwYSize;
            public int dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public short wShowWindow, cbReserved2;
            public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess, hThread;
            public int dwProcessId, dwThreadId;
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessW(
            string lpApplicationName, StringBuilder lpCommandLine,
            IntPtr lpProcessAttributes, IntPtr lpThreadAttributes,
            bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment,
            string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ReadProcessMemory(
            IntPtr hProcess, IntPtr lpBaseAddress,
            byte[] lpBuffer, int dwSize, out int lpNumberOfBytesRead);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WriteProcessMemory(
            IntPtr hProcess, IntPtr lpBaseAddress,
            byte[] lpBuffer, int dwSize, out int lpNumberOfBytesWritten);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool VirtualProtectEx(
            IntPtr hProcess, IntPtr lpAddress, UIntPtr dwSize,
            uint flNewProtect, out uint lpflOldProtect);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WaitForDebugEvent(byte[] lpDebugEvent, int dwMilliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ContinueDebugEvent(int dwProcessId, int dwThreadId, uint dwContinueStatus);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool DebugActiveProcessStop(int dwProcessId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool DebugSetProcessKillOnExit(bool KillOnExit);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr hHandle, int dwMilliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetExitCodeProcess(IntPtr hProcess, out int lpExitCode);

        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr hObject);

        #endregion
    }
}
