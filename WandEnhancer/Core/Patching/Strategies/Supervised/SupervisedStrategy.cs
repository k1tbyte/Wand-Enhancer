using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using WandEnhancer.Core.Patching.Shared;

namespace WandEnhancer.Core.Patching.Strategies.Supervised
{
    internal sealed class SupervisedStrategy : IPatchStrategy
    {
        private const int AsarIntegrityExitCode = -36861;
        private const int ClearWindowMs = 1000;
        private const uint RetryIntervalMs = 4;

        /// <summary>Time threshold to distinguish single-instance handover from user session.</summary>
        private const int HandoffWindowMs = 3000;
        private const string WatchEventName = @"Local\WandEnhancer.Watching";

        private static readonly string OwnImagePath = Assembly.GetExecutingAssembly().Location;

        private readonly IFuseApplicator _fuse = new MemoryFuseApplicator();

        public bool RequiresLauncherAlways => true;

        public void ApplyEnablement(PatchContext context){}

        private sealed class PendingClear
        {
            public int ProcessId;
            public IntPtr Process;
            public int Deadline;
            public string Problem;
            public string Role;
        }

        public bool Launch(PatchContext context, string args)
        {
            // Raised early to prevent a second launcher reading a stale 'not watching' state
            using (Watch(out bool watchedElsewhere))
            {
                return Run(context.Install.ExecutablePath, args, watchedElsewhere, context.Log);
            }
        }

        private bool Run(string exePath, string args, bool watchedElsewhere, Action<string, ELogType> log)
        {
            long stateRva;
            try
            {
                stateRva = ElectronFuseWire.FindStateRva(exePath);
            }
            catch (Exception e) when (e is System.IO.IOException || e is UnauthorizedAccessException)
            {
                // Patched Wand exiting with -36861 is useless, so fail early.
                log?.Invoke($"Could not read {exePath}: {e.Message}", ELogType.Error);
                return false;
            }

            var startupInfo = new STARTUPINFO { cb = Marshal.SizeOf<STARTUPINFO>() };
            var commandLine = new StringBuilder(
                string.IsNullOrEmpty(args) ? $"\"{exePath}\"" : $"\"{exePath}\" {args}");

            // Start suspended to clear fuse and attach job before first instruction.
            if (!CreateProcessW(null, commandLine, IntPtr.Zero, IntPtr.Zero, false, CREATE_SUSPENDED,
                    IntPtr.Zero, System.IO.Path.GetDirectoryName(exePath), ref startupInfo, out var info))
            {
                int error = Marshal.GetLastWin32Error();
                log?.Invoke($"Could not start Wand ({Win32Error.Describe(error)})." + (error == ERROR_ELEVATION_REQUIRED
                    ? " Wand is marked \"Run as administrator\", which stops it from being started this way. " +
                      "Clear that box in the properties of Wand.exe and start it again."
                    : ""), ELogType.Error);
                return false;
            }

            IntPtr job = IntPtr.Zero;
            IntPtr port = IntPtr.Zero;
            bool resumed = false;
            int startedAt = Environment.TickCount;

            try
            {
                log?.Invoke($"Started {exePath} as pid {info.dwProcessId}.", ELogType.Info);

                if (stateRva < 0)
                {
                    log?.Invoke($"No Electron fuse block in {exePath}. A patched Wand will exit " +
                                $"with {AsarIntegrityExitCode}; an unpatched one is unaffected.", ELogType.Error);
                    return false;
                }

                // Main process is suspended; no retry needed.
                IntPtr imageBase = ProcessInfo.GetImageBase(info.hProcess, out string problem);
                bool mainCleared = imageBase != IntPtr.Zero &&
                                   _fuse.ClearIn(info.hProcess, stateRva, imageBase, out problem);
                log?.Invoke(mainCleared
                        ? $"pid {info.dwProcessId} started - fuse cleared."
                        : $"Fuse not cleared in pid {info.dwProcessId}: {problem}. " +
                          $"It may exit with {AsarIntegrityExitCode}.",
                    mainCleared ? ELogType.Info : ELogType.Warn);

                if (!TryTrackChildren(info.hProcess, out job, out port))
                {
                    log?.Invoke($"Could not watch Wand for new processes ({Win32Error.Describe(Marshal.GetLastWin32Error())}). " +
                                "Wand will run, but the in-game overlay will not.", ELogType.Error);
                    return false;
                }

                ResumeThread(info.hThread);
                resumed = true;

                ClearFuseInNewProcesses(port, exePath, stateRva, imageBase,
                    info.dwProcessId, mainCleared, log);

                if (!GetExitCodeProcess(info.hProcess, out int exitCode))
                {
                    log?.Invoke("Wand exited, and its exit code could not be read.", ELogType.Error);
                    return false;
                }

                log?.Invoke($"Wand exited with code {DescribeCode(exitCode)}.",
                    exitCode == 0 ? ELogType.Info : ELogType.Error);

                return exitCode == 0 && !IsHandoff(exePath, watchedElsewhere, startedAt, log);
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

        /// <summary>Detects single-instance handover (secondary instance exits 0 immediately) which leaves unpatched processes with a black window</summary>
        private static bool IsHandoff(string exePath, bool watchedElsewhere, int startedAt,
            Action<string, ELogType> log)
        {
            if (watchedElsewhere || Environment.TickCount - startedAt >= HandoffWindowMs ||
                !AnotherInstanceAlive(exePath))
            {
                return false;
            }

            log?.Invoke("Wand quit right after starting: another Wand was already running and took " +
                        "this launch over. Nothing is clearing the fuse in that instance, which is " +
                        "why its window stays black. End every Wand task in Task Manager, then start " +
                        "Wand again.", ELogType.Error);
            return true;
        }

        private static bool AnotherInstanceAlive(string exePath)
        {
            Process[] processes;
            try
            {
                processes = Process.GetProcessesByName(System.IO.Path.GetFileNameWithoutExtension(exePath));
            }
            catch (Exception e) when (e is InvalidOperationException || e is Win32Exception)
            {
                return false;
            }

            try
            {
                int self;
                int session;
                using (var current = Process.GetCurrentProcess())
                {
                    self = current.Id;
                    session = current.SessionId;
                }

                foreach (var process in processes)
                {
                    // Match session (single-instance lock and signal are session-local); launcher is excluded because no signal is held.
                    if (process.Id != self && process.SessionId == session && IsWand(process.Id, exePath))
                    {
                        return true;
                    }
                }

                return false;
            }
            finally
            {
                foreach (var process in processes)
                {
                    process.Dispose();
                }
            }
        }

        /// <summary>Signals atomically that a launcher is watching process in this session.</summary>
        private static IDisposable Watch(out bool watchedElsewhere)
        {
            try
            {
                var handle = new EventWaitHandle(false, EventResetMode.ManualReset, WatchEventName,
                    out bool createdNew);
                watchedElsewhere = !createdNew;
                return handle;
            }
            catch (Exception e) when (e is UnauthorizedAccessException || e is System.IO.IOException ||
                                      e is WaitHandleCannotBeOpenedException)
            {
                // Signal loss only costs handoff diagnosis.
                watchedElsewhere = true;
                return null;
            }
        }

        /// <summary>Tracks new processes via limitless job object (avoids KILL_ON_JOB_CLOSE)</summary>
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
        private void ClearFuseInNewProcesses(IntPtr port, string exePath, long stateRva,
            IntPtr imageBase, int mainProcessId, bool mainCleared, Action<string, ELogType> log)
        {
            var tracked = new Dictionary<int, IntPtr>();
            var pending = new List<PendingClear>();
            int cleared = mainCleared ? 1 : 0;
            int missed = mainCleared ? 0 : 1;

            try
            {
                while (true)
                {
                    // Wait indefinitely only if no retries are pending.
                    if (!GetQueuedCompletionStatus(port, out uint message, out _, out IntPtr value,
                            pending.Count == 0 ? INFINITE : RetryIntervalMs))
                    {
                        if (Marshal.GetLastWin32Error() != WAIT_TIMEOUT)
                        {
                            break;
                        }

                        // Reset outputs after timeout.
                        message = JOB_OBJECT_MSG_NONE;
                        value = IntPtr.Zero;
                    }

                    if (message == JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO)
                    {
                        break;
                    }

                    int processId = value.ToInt32();
                    if (message == JOB_OBJECT_MSG_EXIT_PROCESS || message == JOB_OBJECT_MSG_ABNORMAL_EXIT_PROCESS)
                    {
                        if (DropPending(pending, processId, log))
                        {
                            missed++;
                        }

                        ReportExit(tracked, processId, log);
                    }
                    // Handle new processes (including the already-patched main process and launched games).
                    else if (message == JOB_OBJECT_MSG_NEW_PROCESS && processId != mainProcessId &&
                             IsWand(processId, exePath))
                    {
                        var entry = new PendingClear
                        {
                            ProcessId = processId,
                            Deadline = Environment.TickCount + ClearWindowMs
                        };

                        if (!TryClear(entry, stateRva, imageBase, tracked, log, ref cleared))
                        {
                            pending.Add(entry);
                        }
                    }

                    RetryPending(pending, stateRva, imageBase, tracked, log, ref cleared, ref missed);
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

        private void RetryPending(List<PendingClear> pending, long stateRva, IntPtr imageBase,
            Dictionary<int, IntPtr> tracked, Action<string, ELogType> log, ref int cleared, ref int missed)
        {
            for (int i = pending.Count - 1; i >= 0; i--)
            {
                var entry = pending[i];
                if (TryClear(entry, stateRva, imageBase, tracked, log, ref cleared))
                {
                    pending.RemoveAt(i);
                }
                else if (Environment.TickCount - entry.Deadline >= 0)
                {
                    missed++;
                    log?.Invoke($"Fuse not cleared in pid {Describe(entry)} after {ClearWindowMs} ms: " +
                                $"{entry.Problem}. It may exit with {AsarIntegrityExitCode}.", ELogType.Warn);
                    pending.RemoveAt(i);
                }
            }
        }

        private bool TryClear(PendingClear entry, long stateRva, IntPtr imageBase,
            Dictionary<int, IntPtr> tracked, Action<string, ELogType> log, ref int cleared)
        {
            if (entry.Process == IntPtr.Zero)
            {
                // Keep handle open to read exit code and prevent PID reuse.
                entry.Process = OpenProcess(ProcessAccess, false, entry.ProcessId);
                if (entry.Process == IntPtr.Zero)
                {
                    entry.Problem = $"it could not be opened ({Win32Error.Describe(Marshal.GetLastWin32Error())})";
                    return false;
                }

                tracked[entry.ProcessId] = entry.Process;
            }

            // Cache role while process is alive for logging if it dies.
            if (entry.Role == null)
            {
                entry.Role = ProcessInfo.GetElectronRole(entry.Process);
            }

            if (!_fuse.ClearIn(entry.Process, stateRva, imageBase, out string problem))
            {
                entry.Problem = problem;
                return false;
            }

            cleared++;
            log?.Invoke($"pid {Describe(entry)} started - fuse cleared.", ELogType.Info);
            return true;
        }

        /// <summary>A process that dies before its fuse is cleared is the failure being counted.</summary>
        private static bool DropPending(List<PendingClear> pending, int processId, Action<string, ELogType> log)
        {
            int index = pending.FindIndex(entry => entry.ProcessId == processId);
            if (index < 0)
            {
                return false;
            }

            log?.Invoke($"Fuse not cleared in pid {Describe(pending[index])} before it exited: " +
                        $"{pending[index].Problem}.", ELogType.Warn);
            pending.RemoveAt(index);
            return true;
        }

        private static string Describe(PendingClear entry)
        {
            return entry.Role == null ? entry.ProcessId.ToString() : $"{entry.ProcessId} ({entry.Role})";
        }

        /// <summary>Reports only non-zero exits to highlight failures</summary>
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

        /// <summary>Matches process name to Wand while excluding launcher itself (avoids short paths/junctions).</summary>
        /// <returns>False if gone, access denied, or mismatch.</returns>
        private static bool IsWand(int processId, string exePath)
        {
            string path = ImagePathOf(processId);
            return path != null &&
                   string.Equals(System.IO.Path.GetFileName(path), System.IO.Path.GetFileName(exePath),
                       StringComparison.OrdinalIgnoreCase) &&
                   !string.Equals(path, OwnImagePath, StringComparison.OrdinalIgnoreCase);
        }

        /// <returns>Null if gone or access denied.</returns>
        private static string ImagePathOf(int processId)
        {
            IntPtr process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
            if (process == IntPtr.Zero)
            {
                return null;
            }

            try
            {
                string path = QueryImageName(process, MaxPathLength, out int error);
                // Retry with long buffer for MAX_PATH to prevent unrecognized children exiting with -36861.
                return path == null && error == ERROR_INSUFFICIENT_BUFFER
                    ? QueryImageName(process, LongPathLength, out _)
                    : path;
            }
            finally
            {
                CloseHandle(process);
            }
        }

        private static string QueryImageName(IntPtr process, int capacity, out int error)
        {
            var path = new StringBuilder(capacity);
            int length = path.Capacity;
            if (QueryFullProcessImageName(process, 0, path, ref length))
            {
                error = 0;
                return path.ToString();
            }

            error = Marshal.GetLastWin32Error();
            return null;
        }

        private static string DescribeCode(int code)
        {
            switch (code)
            {
                case 0: return "0";
                case AsarIntegrityExitCode:
                    return $"{code} (ASAR integrity check failed - the fuse was not cleared in time)";
                // Chromium triggers missing debugger on fatal error.
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
        private const int ERROR_ELEVATION_REQUIRED = 740;
        private const int ERROR_INSUFFICIENT_BUFFER = 122;
        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

        // VM_OPERATION | VM_READ | VM_WRITE plus limited query (hardened processes may deny full query).
        private const uint ProcessAccess = 0x0008 | 0x0010 | 0x0020 | PROCESS_QUERY_LIMITED_INFORMATION;
        private const int MaxPathLength = 260;
        private const int LongPathLength = 32767;
        private const int JobObjectAssociateCompletionPortInformation = 7;
        private const int WAIT_TIMEOUT = 258;
        private const uint JOB_OBJECT_MSG_NONE = 0;
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
