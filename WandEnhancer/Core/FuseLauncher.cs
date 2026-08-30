using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using WandEnhancer.View.MainWindow;

namespace WandEnhancer.Core
{
    /// <summary>
    /// Starts Wand and keeps the ASAR integrity fuse cleared in every process Electron spawns,
    /// for as long as Wand runs. Covering only the startup burst is not enough: the renderer
    /// behind the in-game overlay is created when a game launches, and exits with -36861 the
    /// moment it opens the patched archive, leaving the overlay dead while Wand itself looks
    /// healthy.
    /// Wand is put in a job object, which every descendant joins on its own, and the kernel
    /// posts each new process to a completion port. A debugger would report the same events, but
    /// it is inherited too - by a game started from Wand included - and games treat a debug port
    /// as tampering. Nothing here is attached to the game beyond reading its image path.
    /// </summary>
    internal static class FuseLauncher
    {
        private const int AsarIntegrityExitCode = -36861;

        /// <returns>False when the session ended badly enough to be worth showing the user.</returns>
        public static bool Launch(string exePath, string args, Action<string, ELogType> log = null)
        {
            long stateRva = ElectronFuse.FindStateRva(exePath);

            var startupInfo = new STARTUPINFO { cb = Marshal.SizeOf<STARTUPINFO>() };
            var commandLine = new StringBuilder(
                string.IsNullOrEmpty(args) ? $"\"{exePath}\"" : $"\"{exePath}\" {args}");

            // Suspended, so the fuse is cleared and the job is attached before Wand runs its
            // first instruction. Every child is then born inside the job.
            if (!CreateProcessW(null, commandLine, IntPtr.Zero, IntPtr.Zero, false, CREATE_SUSPENDED,
                    IntPtr.Zero, System.IO.Path.GetDirectoryName(exePath), ref startupInfo, out var info))
            {
                log?.Invoke($"Could not start Wand (win32 error {Marshal.GetLastWin32Error()}).", ELogType.Error);
                return false;
            }

            IntPtr job = IntPtr.Zero;
            IntPtr port = IntPtr.Zero;
            bool resumed = false;

            try
            {
                log?.Invoke($"Started {exePath} as pid {info.dwProcessId}.", ELogType.Info);

                if (stateRva < 0)
                {
                    log?.Invoke($"No Electron fuse block in {exePath}. A patched Wand will exit " +
                                $"with {AsarIntegrityExitCode}; an unpatched one is unaffected.", ELogType.Error);
                    return false;
                }

                bool mainCleared = ElectronFuse.ClearIn(info.hProcess, stateRva);
                log?.Invoke(mainCleared
                        ? $"pid {info.dwProcessId} started - fuse cleared."
                        : $"Fuse not cleared in pid {info.dwProcessId}; it may exit with {AsarIntegrityExitCode}.",
                    mainCleared ? ELogType.Info : ELogType.Warn);

                if (!TryTrackChildren(info.hProcess, out job, out port))
                {
                    log?.Invoke($"Could not watch Wand for new processes (win32 error {Marshal.GetLastWin32Error()}). " +
                                "Wand will run, but the in-game overlay will not.", ELogType.Error);
                    return false;
                }

                ResumeThread(info.hThread);
                resumed = true;

                ClearFuseInNewProcesses(port, exePath, stateRva, info.dwProcessId, mainCleared, log);

                if (!GetExitCodeProcess(info.hProcess, out int exitCode))
                {
                    log?.Invoke("Wand exited, and its exit code could not be read.", ELogType.Error);
                    return false;
                }

                log?.Invoke($"Wand exited with code {DescribeCode(exitCode)}.",
                    exitCode == 0 ? ELogType.Info : ELogType.Error);
                return exitCode == 0;
            }
            finally
            {
                if (!resumed)
                {
                    ResumeThread(info.hThread);
                }

                CloseHandle(info.hThread);
                CloseHandle(info.hProcess);
                if (port != IntPtr.Zero)
                {
                    CloseHandle(port);
                }

                if (job != IntPtr.Zero)
                {
                    CloseHandle(job);
                }
            }
        }

        /// <summary>
        /// No limits are set on the job: it exists only to be told about new processes. That also
        /// keeps KILL_ON_JOB_CLOSE off, so Wand outlives the launcher rather than dying with it.
        /// </summary>
        private static bool TryTrackChildren(IntPtr process, out IntPtr job, out IntPtr port)
        {
            port = IntPtr.Zero;
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero)
            {
                return false;
            }

            port = CreateIoCompletionPort(INVALID_HANDLE_VALUE, IntPtr.Zero, UIntPtr.Zero, 1);
            if (port == IntPtr.Zero)
            {
                return false;
            }

            var association = new JOBOBJECT_ASSOCIATE_COMPLETION_PORT { CompletionKey = IntPtr.Zero, CompletionPort = port };
            return SetInformationJobObject(job, JobObjectAssociateCompletionPortInformation,
                       ref association, Marshal.SizeOf(association))
                   && AssignProcessToJobObject(job, process);
        }

        /// <summary>Blocks until the last process in the job is gone.</summary>
        private static void ClearFuseInNewProcesses(IntPtr port, string exePath, long stateRva,
            int mainProcessId, bool mainCleared, Action<string, ELogType> log)
        {
            var tracked = new Dictionary<int, IntPtr>();
            int cleared = mainCleared ? 1 : 0;
            int missed = mainCleared ? 0 : 1;

            try
            {
                while (GetQueuedCompletionStatus(port, out uint message, out _, out IntPtr value, INFINITE))
                {
                    if (message == JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO)
                    {
                        break;
                    }

                    int processId = value.ToInt32();
                    if (message == JOB_OBJECT_MSG_EXIT_PROCESS || message == JOB_OBJECT_MSG_ABNORMAL_EXIT_PROCESS)
                    {
                        ReportExit(tracked, processId, log);
                        continue;
                    }

                    // The main process is announced here too, having been patched while it was
                    // still suspended, and a game started from Wand joins the job like any child.
                    if (message != JOB_OBJECT_MSG_NEW_PROCESS || processId == mainProcessId ||
                        !IsImage(processId, exePath))
                    {
                        continue;
                    }

                    // The handle is kept open: it is what makes the exit code readable later, and
                    // it also stops Windows handing the pid to someone else in the meantime.
                    IntPtr process = OpenProcess(ProcessAccess, false, processId);
                    if (process != IntPtr.Zero)
                    {
                        tracked[processId] = process;
                    }

                    if (process != IntPtr.Zero && ElectronFuse.ClearIn(process, stateRva))
                    {
                        cleared++;
                        log?.Invoke($"pid {processId} started - fuse cleared.", ELogType.Info);
                    }
                    else
                    {
                        missed++;
                        log?.Invoke($"Fuse not cleared in pid {processId}; it may exit with {AsarIntegrityExitCode}.",
                            ELogType.Warn);
                    }
                }
            }
            finally
            {
                foreach (var handle in tracked.Values)
                {
                    CloseHandle(handle);
                }
            }

            log?.Invoke($"Wand closed: fuse cleared in {cleared} processes" + (missed == 0 ? "." : $", {missed} missed."),
                missed == 0 ? ELogType.Info : ELogType.Warn);
        }

        /// <summary>
        /// Only anomalies are reported: on a normal shutdown every process exits with 0, and a
        /// line each would bury the one death that matters.
        /// </summary>
        private static void ReportExit(Dictionary<int, IntPtr> tracked, int processId, Action<string, ELogType> log)
        {
            if (!tracked.TryGetValue(processId, out IntPtr process))
            {
                return;
            }

            tracked.Remove(processId);
            if (GetExitCodeProcess(process, out int exitCode) && exitCode != 0)
            {
                log?.Invoke($"pid {processId} exited with code {DescribeCode(exitCode)}.", ELogType.Error);
            }

            CloseHandle(process);
        }

        /// <summary>
        /// Identity check before anything heavier: a game started from Wand is in the job as well,
        /// and is opened for nothing beyond the right the task manager uses to read a path.
        /// </summary>
        private static bool IsImage(int processId, string exePath)
        {
            IntPtr process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
            if (process == IntPtr.Zero)
            {
                return false;
            }

            try
            {
                var path = new StringBuilder(MaxPathLength);
                int length = path.Capacity;
                return QueryFullProcessImageName(process, 0, path, ref length) &&
                       string.Equals(path.ToString(), exePath, StringComparison.OrdinalIgnoreCase);
            }
            finally
            {
                CloseHandle(process);
            }
        }

        private static string DescribeCode(int code)
        {
            switch (code)
            {
                case 0: return "0";
                case AsarIntegrityExitCode:
                    return $"{code} (ASAR integrity check failed - the fuse was not cleared in time)";
                // Chromium breaks into a debugger that is not there when it hits a fatal error.
                case unchecked((int)0x80000003): return $"0x{code:X8} (Wand aborted itself during startup)";
                case unchecked((int)0xC0000005): return $"0x{code:X8} (access violation)";
                case unchecked((int)0xC0000135): return $"0x{code:X8} (a required DLL is missing)";
                case unchecked((int)0xC0000142): return $"0x{code:X8} (a DLL failed to initialise)";
                case unchecked((int)0xC0000409): return $"0x{code:X8} (stack buffer overrun)";
                default: return $"{code} (0x{code:X8})";
            }
        }

        #region P/Invoke

        private const uint CREATE_SUSPENDED = 0x4;
        private const uint ProcessAccess = 0x0008 | 0x0010 | 0x0020 | 0x0400;
        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        private const int MaxPathLength = 260;
        private const int JobObjectAssociateCompletionPortInformation = 7;
        private const uint JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO = 4;
        private const uint JOB_OBJECT_MSG_NEW_PROCESS = 6;
        private const uint JOB_OBJECT_MSG_EXIT_PROCESS = 7;
        private const uint JOB_OBJECT_MSG_ABNORMAL_EXIT_PROCESS = 8;
        private const uint INFINITE = 0xFFFFFFFF;
        private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

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

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_ASSOCIATE_COMPLETION_PORT
        {
            public IntPtr CompletionKey;
            public IntPtr CompletionPort;
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessW(
            string lpApplicationName, StringBuilder lpCommandLine,
            IntPtr lpProcessAttributes, IntPtr lpThreadAttributes,
            bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment,
            string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint ResumeThread(IntPtr hThread);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(
            IntPtr hJob, int jobObjectInformationClass,
            ref JOBOBJECT_ASSOCIATE_COMPLETION_PORT lpJobObjectInformation, int cbJobObjectInformationLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateIoCompletionPort(
            IntPtr fileHandle, IntPtr existingCompletionPort, UIntPtr completionKey, uint numberOfConcurrentThreads);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetQueuedCompletionStatus(
            IntPtr completionPort, out uint lpNumberOfBytes, out IntPtr lpCompletionKey,
            out IntPtr lpOverlapped, uint dwMilliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool QueryFullProcessImageName(
            IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref int lpdwSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetExitCodeProcess(IntPtr hProcess, out int lpExitCode);

        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr hObject);

        #endregion
    }
}
