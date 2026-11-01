using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace WandEnhancer.Utils
{
    public static class ProcessTerminator
    {
        private const int KillAttempts = 5;
        private const int KillRetryDelayMs = 250;

        public static void TryKillProcess(string processName)
        {
            // The launcher itself runs as Wand.exe; never target our own process.
            int selfId = Process.GetCurrentProcess().Id;
            KillUntilGone(processName, () => Others(Process.GetProcessesByName(processName), selfId));
        }

        /// <summary>
        /// Kills every running process whose executable lives under <paramref name="directory"/>.
        /// Reaches helpers the brand name alone misses: Squirrel's Update.exe, crashpad,
        /// the deployed update watcher - all of which keep the same install files locked.
        /// </summary>
        public static void TryKillProcessesUnder(string directory)
        {
            int selfId = Process.GetCurrentProcess().Id;
            string prefix = Path.GetFullPath(directory)
                                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                            + Path.DirectorySeparatorChar;
            KillUntilGone($"a helper under \"{prefix}\"", () => Under(prefix, selfId));
        }

        /// <summary>
        /// Best-effort "name (PID)" list of processes that still have a module loaded from
        /// under <paramref name="path"/> - e.g. the game holding overlay_game_x64.dll.
        /// </summary>
        public static List<string> FindProcessesUsing(string path)
        {
            string prefix = Path.GetFullPath(path)
                                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                            + Path.DirectorySeparatorChar;
            var names = new List<string>();
            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    foreach (ProcessModule module in process.Modules)
                    {
                        if (module.FileName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                        {
                            names.Add($"{process.ProcessName} (PID {process.Id})");
                            break;
                        }
                    }
                }
                catch (Exception e) when (e is InvalidOperationException || e is Win32Exception ||
                                          e is NotSupportedException)
                {
                    // Protected or already exited: it cannot be blamed either way.
                }
                finally
                {
                    process.Dispose();
                }
            }

            return names;
        }

        private static void KillUntilGone(string target, Func<Process[]> find)
        {
            for (int attempt = 0; attempt < KillAttempts; attempt++)
            {
                var processes = find();
                try
                {
                    if (processes.Length == 0)
                    {
                        return;
                    }

                    foreach (var process in processes)
                    {
                        try
                        {
                            process.Kill();
                            // Kill() only requests an exit; wait for it so a process caught
                            // mid-shutdown is not mistaken for a survivor on the next pass.
                            process.WaitForExit(KillRetryDelayMs);
                        }
                        catch (Exception e) when (e is InvalidOperationException || e is Win32Exception)
                        {
                            // Already exited, or protected: the post-loop check decides the outcome.
                        }
                    }
                }
                finally
                {
                    foreach (var process in processes)
                    {
                        process.Dispose();
                    }
                }

                Thread.Sleep(KillRetryDelayMs);
            }

            var survivors = find();
            try
            {
                if (survivors.Length > 0)
                {
                    throw new InvalidOperationException(
                        $"Failed to close {target}: {Describe(survivors)} still running. " +
                        "Close it manually and try again; if it is elevated, run the enhancer as administrator too.");
                }
            }
            finally
            {
                foreach (var process in survivors)
                {
                    process.Dispose();
                }
            }
        }

        private static string Describe(Process[] processes)
        {
            var names = new List<string>(processes.Length);
            foreach (var process in processes)
            {
                names.Add($"{process.ProcessName} (PID {process.Id})");
            }

            return string.Join(", ", names);
        }

        private static Process[] Under(string directoryPrefix, int selfId)
        {
            var result = new List<Process>();
            foreach (var process in Process.GetProcesses())
            {
                if (process.Id == selfId)
                {
                    process.Dispose();
                    continue;
                }

                string imagePath;
                try
                {
                    imagePath = process.MainModule.FileName;
                }
                catch (Exception e) when (e is InvalidOperationException || e is Win32Exception ||
                                          e is NotSupportedException)
                {
                    // Protected or already exited: not reachable from here anyway.
                    process.Dispose();
                    continue;
                }

                if (imagePath != null &&
                    imagePath.StartsWith(directoryPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    result.Add(process);
                }
                else
                {
                    process.Dispose();
                }
            }

            return result.ToArray();
        }

        private static Process[] Others(Process[] processes, int selfId)
        {
            var result = new List<Process>(processes.Length);
            foreach (var process in processes)
            {
                if (process.Id == selfId)
                {
                    process.Dispose();
                    continue;
                }

                result.Add(process);
            }

            return result.ToArray();
        }
    }
}
