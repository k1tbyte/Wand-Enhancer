using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using WeModPatcher.Models;

namespace WeModPatcher.Utils
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
            
            foreach (var folder in Constants.WeModBrandNames)
            {
                var weModDir = Path.Combine(localAppDataPath ?? "", folder);
                if(Directory.Exists(weModDir))
                {
                    return FindLatestWeMod(weModDir);
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