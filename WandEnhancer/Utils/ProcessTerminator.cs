using System;
using System.Collections.Generic;
using System.Diagnostics;
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

            for (int attempt = 0; attempt < KillAttempts; attempt++)
            {
                var processes = Others(Process.GetProcessesByName(processName), selfId);
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
                        }
                        catch (Exception e) when (e is InvalidOperationException || e is System.ComponentModel.Win32Exception)
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

            var survivors = Others(Process.GetProcessesByName(processName), selfId);
            try
            {
                if (survivors.Length > 0)
                {
                    throw new InvalidOperationException($"Failed to close {processName}. Close it manually and try again.");
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
