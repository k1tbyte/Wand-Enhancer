using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using WeModPatcher.Core;
using WeModPatcher.Core.Services;
using WeModPatcher.View.MainWindow;

namespace WeModPatcher.View.Popups
{
    public partial class SettingsPopup : UserControl
    {
        private CultureInfo _selectedLanguage;

        public SettingsPopup()
        {
            InitializeComponent();
            LoadLanguages();
        }

        private void LoadLanguages()
        {
            var items = LocalizationManager.SupportedLanguages
                .Select(c => new LanguageItem
                {
                    Culture = c,
                    DisplayName = LocalizationManager.GetLanguageDisplayName(c)
                })
                .ToList();

            LanguageComboBox.ItemsSource = items;
            
            var currentItem = items.FirstOrDefault(i => i.Culture.Name == LocalizationManager.CurrentLanguage?.Name);
            if (currentItem != null)
            {
                LanguageComboBox.SelectedItem = currentItem;
            }
            
            _selectedLanguage = LocalizationManager.CurrentLanguage;
        }

        private void OnLanguageSelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (LanguageComboBox.SelectedItem is LanguageItem item)
            {
                _selectedLanguage = item.Culture;
            }
        }

        private void OnSaveClick(object sender, RoutedEventArgs e)
        {
            if (_selectedLanguage != null && 
                (LocalizationManager.CurrentLanguage == null || 
                 _selectedLanguage.Name != LocalizationManager.CurrentLanguage.Name))
            {
                LocalizationManager.CurrentLanguage = _selectedLanguage;
            }
            
            MainWindow.MainWindow.Instance.ClosePopup();
        }

        private class LanguageItem
        {
            public CultureInfo Culture { get; set; }
            public string DisplayName { get; set; }
        }
    }
}
