using System;
using System.Collections.ObjectModel;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using WandEnhancer.Models;

namespace WandEnhancer.View.Popups
{
    public partial class PatchVectorsPopup : UserControl
    {
        private const string JavaScriptDialogFilter = "JavaScript files (*.js)|*.js";
        private const string JavaScriptFileExtension = ".js";

        private readonly Action<PatchConfig> _onApply;
        private readonly ObservableCollection<SelectedScript> _selectedScripts = new ObservableCollection<SelectedScript>();

        public PatchVectorsPopup(Action<PatchConfig> onApply)
        {
            _onApply = onApply;
            InitializeComponent();
            ScriptList.ItemsSource = _selectedScripts;
            UpdateScriptsEmptyState();
        }

        private void OnAddScriptClick(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog
            {
                Filter = JavaScriptDialogFilter,
                Multiselect = true,
                CheckFileExists = true
            };

            if (dialog.ShowDialog() != true)
            {
                return;
            }

            foreach (var path in dialog.FileNames.Where(IsJavaScriptFile))
            {
                AddScript(path);
            }

            if (_selectedScripts.Count > 0)
            {
                RemoteWebPanelPreviewBox.IsChecked = true;
            }

            UpdateScriptsEmptyState();
        }

        private void OnRemoveScriptClick(object sender, RoutedEventArgs e)
        {
            var button = sender as Button;
            var script = button?.Tag as SelectedScript;
            if (script == null)
            {
                return;
            }

            _selectedScripts.Remove(script);
            UpdateScriptsEmptyState();
        }

        private void OnPatchButtonClick(object sender, RoutedEventArgs e)
        {
            if (ActivateProBox.IsChecked != true && DisableUpdateBox.IsChecked != true &&
                DevToolsHotkeyBox.IsChecked != true && RemoteWebPanelPreviewBox.IsChecked != true)
            {
                return;
            }
            
            var result = new HashSet<EPatchType>();
            if (ActivateProBox.IsChecked == true)
            {
                result.Add(EPatchType.ActivatePro);
            }

            if (DisableUpdateBox.IsChecked == true)
            {
                result.Add(EPatchType.DisableUpdates);
            }

            if (DevToolsHotkeyBox.IsChecked == true)
            {
                result.Add(EPatchType.DevToolsOnF12);
            }

            if (RemoteWebPanelPreviewBox.IsChecked == true)
            {
                result.Add(EPatchType.RemoteWebPanelPreview);
            }

            _onApply(new PatchConfig
            {
                PatchTypes = result,
                CustomScriptPaths = _selectedScripts.Select(script => script.FullPath).ToList(),
                AutoApplyPatches = false
            });
        }

        private void AddScript(string path)
        {
            var fullPath = Path.GetFullPath(path);
            if (_selectedScripts.Any(script => string.Equals(script.FullPath, fullPath, StringComparison.OrdinalIgnoreCase)))
            {
                return;
            }

            _selectedScripts.Add(new SelectedScript(fullPath));
        }

        private static bool IsJavaScriptFile(string path)
        {
            return File.Exists(path) && string.Equals(Path.GetExtension(path), JavaScriptFileExtension, StringComparison.OrdinalIgnoreCase);
        }

        private void UpdateScriptsEmptyState()
        {
            NoScriptsText.Visibility = _selectedScripts.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        private sealed class SelectedScript
        {
            public SelectedScript(string fullPath)
            {
                FullPath = fullPath;
                FileName = Path.GetFileName(fullPath);
            }

            public string FullPath { get; }

            public string FileName { get; }
        }
    }
}