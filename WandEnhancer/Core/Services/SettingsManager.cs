using System;
using System.IO;
using Newtonsoft.Json;

namespace WandEnhancer.Core.Services
{
    public class AppSettings
    {
        public string Language { get; set; }

        public bool CheckUpdates { get; set; } = true;

        public bool CheckPrereleases { get; set; }
    }
    
    public static class SettingsManager
    {
        private static readonly string SettingsPath = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, 
            Constants.AppSettingsFileName);

        public static AppSettings LoadSettings()
        {
            try
            {
                if (File.Exists(SettingsPath))
                {
                    var json = File.ReadAllText(SettingsPath);
                    return JsonConvert.DeserializeObject<AppSettings>(json);
                }
            }
            catch (Exception)
            {
                // Ignore unreadable or corrupt settings.
            }
            return null;
        }

        public static void SaveSettings(AppSettings settings)
        {
            try
            {
                var json = JsonConvert.SerializeObject(settings, Formatting.Indented);
                File.WriteAllText(SettingsPath, json);
            }
            catch (Exception)
            {
                // Ignore save errors like read-only directories.
            }
        }
    }
}