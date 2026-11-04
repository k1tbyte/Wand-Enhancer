using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using WandEnhancer.Models;

namespace WandEnhancer.Utils
{
    public static class WeModInstalls
    {
        public const string JavaScriptFileExtension = ".js";

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
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is ArgumentException)
            {
                // An unreadable or malformed candidate directory is not this install.
            }

            return null;
        }

        /// <summary>Accepts an <c>app-*</c> version folder or the Squirrel root that holds them, what a user picks or drops.</summary>
        public static WeModConfig ResolveInstall(string path)
        {
            var config = CheckWeModPath(path);
            if (config != null)
            {
                return config;
            }

            return TryFindLatestWeMod(path);
        }

        /// <summary>
        /// The newest install in the current one's Squirrel root (an update may have added it), else the current
        /// one while it is still valid, which covers a hand-picked folder that is not an <c>app-*</c> folder.
        /// </summary>
        public static WeModConfig Rescan(string squirrelRoot, WeModConfig current) =>
            TryFindLatestWeMod(squirrelRoot) ?? CheckWeModPath(current.RootDirectory);

        /// <summary>A root that cannot be listed is not an install and must not abort a scan of the others.</summary>
        private static WeModConfig TryFindLatestWeMod(string root)
        {
            try
            {
                return FindLatestWeMod(root);
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is ArgumentException)
            {
                return null;
            }
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
                    var config = TryFindLatestWeMod(weModDir);
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
        
        public static bool IsJavaScriptFile(string path)
        {
            return File.Exists(path)
                   && string.Equals(Path.GetExtension(path), JavaScriptFileExtension, StringComparison.OrdinalIgnoreCase);
        }

        private static readonly Regex AppFolderVersion = new Regex(@"^app-(\d+(?:\.\d+){1,3})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static Version ParseFolderVersion(string folderName)
        {
            var match = AppFolderVersion.Match(folderName);
            if (match.Success && Version.TryParse(match.Groups[1].Value, out var version))
            {
                return version;
            }

            return new Version(0, 0);
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
                    Version = ParseFolderVersion(dirInfo.Name),
                    LastModified = dirInfo.LastWriteTime
                })
                .OrderByDescending(item => item.Version)
                .ThenByDescending(item => item.LastModified)
                .ToList();

            return appFolders
                .Select(folder => CheckWeModPath(folder.Path))
                .FirstOrDefault(config => config != null);
        }

        public static WeModConfig FindNewerInstall(string squirrelRoot, WeModConfig current)
        {
            var currentVersion = ParseFolderVersion(Path.GetFileName(current.RootDirectory));
            return Directory.EnumerateDirectories(squirrelRoot)
                .Select(folderPath => new DirectoryInfo(folderPath))
                .Where(dirInfo => Regex.IsMatch(dirInfo.Name, @"^app-\w+"))
                .Select(dirInfo => new { Path = dirInfo.FullName, Version = ParseFolderVersion(dirInfo.Name) })
                .Where(item => item.Version.CompareTo(currentVersion) > 0)
                .OrderByDescending(item => item.Version)
                .Select(item => CheckWeModPath(item.Path))
                .FirstOrDefault(config => config != null);
        }
    }
}