using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Windows;

namespace WeModPatcher.Core.Services
{
    public static class LocalizationManager
    {
        public static readonly List<CultureInfo> SupportedLanguages = new List<CultureInfo>
        {
            new CultureInfo("en-US"),
            new CultureInfo("zh-CN"),
            new CultureInfo("de-DE"),
            new CultureInfo("fr-FR"),
            new CultureInfo("es-ES"),
            new CultureInfo("it-IT"),
            new CultureInfo("pt-BR"),
            new CultureInfo("pl-PL"),
            new CultureInfo("ru-RU"),
            new CultureInfo("uk-UA"),
            new CultureInfo("ja-JP"),
            new CultureInfo("tr-TR")
        };

        private static CultureInfo _currentLanguage;
        private static ResourceDictionary _englishBaseDictionary;

        public static CultureInfo CurrentLanguage
        {
            get => _currentLanguage;
            set => SetLanguage(value);
        }

        public static void Initialize()
        {
            // Load English as the base fallback dictionary
            _englishBaseDictionary = new ResourceDictionary
            {
                Source = new Uri("Locale/lang.en-US.xaml", UriKind.Relative)
            };

            // Try to load saved language preference
            var savedLanguage = SettingsManager.LoadSettings()?.Language;
            CultureInfo targetCulture = null;

            if (!string.IsNullOrEmpty(savedLanguage))
            {
                targetCulture = SupportedLanguages.FirstOrDefault(c => c.Name == savedLanguage);
            }

            if (targetCulture == null)
            {
                // Fall back to system culture detection
                var systemCulture = Thread.CurrentThread.CurrentUICulture;
                targetCulture = SupportedLanguages.FirstOrDefault(c => 
                    c.Name == systemCulture.Name || 
                    c.TwoLetterISOLanguageName == systemCulture.TwoLetterISOLanguageName);
            }
            
            SetLanguage(targetCulture ?? SupportedLanguages[0], saveSettings: false);
        }

        private static void SetLanguage(CultureInfo culture, bool saveSettings = true)
        {
            if (culture == null)
                throw new ArgumentNullException(nameof(culture));

            if (Equals(culture, _currentLanguage))
                return;

            var supportedCulture = SupportedLanguages.FirstOrDefault(c => c.Name == culture.Name);
            if (supportedCulture == null)
            {
                supportedCulture = SupportedLanguages[0]; // Default to English
            }

            _currentLanguage = supportedCulture;
            Thread.CurrentThread.CurrentUICulture = supportedCulture;

            // Create the locale dictionary with English as base for fallback
            var localeDict = new ResourceDictionary();
            
            // First, add English base dictionary for fallback
            if (_englishBaseDictionary != null && supportedCulture.Name != SupportedLanguages[0].Name)
            {
                foreach (var key in _englishBaseDictionary.Keys)
                {
                    localeDict[key] = _englishBaseDictionary[key];
                }
            }

            // Then overlay with the selected language (will override English keys)
            var targetDict = new ResourceDictionary
            {
                Source = new Uri($"Locale/lang.{supportedCulture.Name}.xaml", UriKind.Relative)
            };
            
            foreach (DictionaryEntry entry in targetDict)
            {
                localeDict[entry.Key] = targetDict[entry.Key];
            }

            // Find and replace the old locale dictionary
            var oldDict = Application.Current.Resources.MergedDictionaries
                .FirstOrDefault(d => d.Source != null && d.Source.OriginalString.StartsWith("Locale/lang."));

            if (oldDict != null)
            {
                var index = Application.Current.Resources.MergedDictionaries.IndexOf(oldDict);
                Application.Current.Resources.MergedDictionaries.Remove(oldDict);
                Application.Current.Resources.MergedDictionaries.Insert(index, localeDict);
            }
            else
            {
                Application.Current.Resources.MergedDictionaries.Add(localeDict);
            }
            
            if (saveSettings)
            {
                SettingsManager.SaveSettings(new AppSettings { Language = supportedCulture.Name });
            }
        }

        public static string GetLanguageDisplayName(CultureInfo culture)
        {
            try
            {
                var dict = new ResourceDictionary
                {
                    Source = new Uri($"Locale/lang.{culture.Name}.xaml", UriKind.Relative)
                };
                
                if (dict.Contains("language_display_name"))
                {
                    return dict["language_display_name"] as string ?? culture.NativeName;
                }
            }
            catch
            {
                // Fallback to native name if loading fails
            }
            
            return culture.NativeName;
        }
    }
}
