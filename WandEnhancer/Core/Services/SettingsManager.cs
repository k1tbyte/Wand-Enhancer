using System;
using System.IO;
using Newtonsoft.Json;

namespace WandEnhancer.Core.Services
{
    public class AppSettings
    {
        public string Language { get; set; }
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
                // Unreadable or corrupt settings must not block startup; defaults apply.
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
                // A read-only install directory must not break the app; the choice is lost, not fatal.
            }
        }
    }
}