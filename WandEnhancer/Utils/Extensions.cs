using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using WandEnhancer.Models;

namespace WandEnhancer.Utils
{
    public static class Extensions
    {
        public static WeModConfig CheckWeModPath(string versionRoot)
        {
            try
            {
                
                foreach (var name in Constants.WeModBrandNames)
                {
                    var exeName = $"{name}.exe";
                    var path = Path.Combine(versionRoot, exeName);
                    if (File.Exists(path) && File.Exists(Path.Combine(versionRoot, "resources", "app.asar")))
                    {
                        return new WeModConfig
                        {
                            BrandName = name,
                            ExecutableName = exeName,
                            RootDirectory = versionRoot
                        };
                    }
                }
            }
            catch
            {
                // ignored
            }

            return null;
        }
        
        public static WeModConfig FindWeMod()
        {
            string localAppDataPath = Environment.GetEnvironmentVariable("LOCALAPPDATA");

            if (!string.IsNullOrEmpty(localAppDataPath))
            {
                foreach (var folder in Constants.WeModBrandNames)
                {
                    var weModDir = Path.Combine(localAppDataPath, folder);
                    if (!Directory.Exists(weModDir))
                    {
                        continue;
                    }

                    // Keep scanning the other brand folders if this one has no valid
                    // install instead of giving up on the first folder that exists.
                    var config = FindLatestWeMod(weModDir);
                    if (config != null)
                    {
                        return config;
                    }
                }
            }

            // Fallback: a running Wand/WeMod process reveals the install directory
            // wherever it lives (non-default LOCALAPPDATA, moved install, other drive).
            return FindWeModFromRunningProcess();
        }

        private static WeModConfig FindWeModFromRunningProcess()
        {
            foreach (var name in Constants.WeModBrandNames)
            {
                Process[] processes;
                try
                {
                    processes = Process.GetProcessesByName(name);
                }
                catch
                {
                    continue;
                }

                foreach (var process in processes)
                {
                    try
                    {
                        var exePath = process.MainModule?.FileName;
                        if (string.IsNullOrEmpty(exePath))
                        {
                            continue;
                        }

                        // Process may be the versioned exe (dir is the install root) or
                        // the launcher stub at the parent (dir holds `app-*` subfolders).
                        var processDir = Path.GetDirectoryName(exePath);
                        var config = CheckWeModPath(processDir) ?? FindLatestWeMod(processDir);
                        if (config != null)
                        {
                            return config;
                        }
                    }
                    catch
                    {
                        // MainModule throws on access-denied / bitness mismatch; skip.
                    }
                    finally
                    {
                        process.Dispose();
                    }
                }
            }

            return null;
        }
        
        public static string Base64Decode(string base64EncodedData) 
        {
            var base64EncodedBytes = System.Convert.FromBase64String(base64EncodedData);
            return System.Text.Encoding.UTF8.GetString(base64EncodedBytes);
        }
        
        public static string Base64Encode(string plainText) 
        {
            var plainTextBytes = System.Text.Encoding.UTF8.GetBytes(plainText);
            return System.Convert.ToBase64String(plainTextBytes);
        }

        public static WeModConfig FindLatestWeMod(string root)
        {
            var appFolders = Directory.EnumerateDirectories(root)
                .Select(folderPath => new DirectoryInfo(folderPath))
                .Where(dirInfo => Regex.IsMatch(dirInfo.Name, @"^app-\w+"))
                .Select(dirInfo => new
                {
                    Name = dirInfo.Name,
                    Path = dirInfo.FullName,
                    LastModified = dirInfo.LastWriteTime
                })
                .OrderByDescending(item => item.LastModified)
                .ToList();
            

            return appFolders
                .Select(folder => CheckWeModPath(folder.Path))
                .FirstOrDefault(config => config != null);
        }
    }
}