using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;

namespace WandEnhancer.Utils
{
    public static class Common
    {
        public static void TryKillProcess(string processName)
        {
            Process[] processes = Process.GetProcessesByName(processName);
            // Retry while any target process is still alive, capped at 5 attempts.
            // The previous condition (processes.Length > i || i < 5) compared the
            // process count to the loop index and, because of the "|| i < 5", always
            // ran at least 5 iterations — sleeping ~1.25s even when the process was
            // never running.
            for (int i = 0; processes.Length > 0 && i < 5; i++)
            {
                foreach (var process in processes)
                {
                    try
                    {
                        process.Kill();
                    }
                    catch
                    {
                        // ignored
                    }
                }
                
                processes = Process.GetProcessesByName(processName);
                Thread.Sleep(250);
            }
            
            if (processes.Length > 0)
            {
                throw new Exception("Failed to kill WeMod");
            }
        }

        public static string GetCurrentDir()
        {
            var assemblyLocation = Assembly.GetExecutingAssembly().Location;
            return Path.GetDirectoryName(assemblyLocation) ?? throw new InvalidOperationException();
        }
        
        public static string ComputeSha256Hash(string input)
        {
            using (var sha256 = System.Security.Cryptography.SHA256.Create())
            {
                var bytes = System.Text.Encoding.UTF8.GetBytes(input);
                var hashBytes = sha256.ComputeHash(bytes);
                return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
            }
        }
    }
}