using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;

namespace WeModPatcher.Utils
{
    public static class Common
    {
        public static void TryKillProcess(string processName)
        {
            Process[] processes = Process.GetProcessesByName(processName);
            for (int i = 0; processes.Length > i || i < 5; i++)
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