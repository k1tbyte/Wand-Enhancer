using System;
using System.Collections.ObjectModel;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using WandEnhancer.Core.Services;
using WandEnhancer.Models;
using WandEnhancer.Utils;

namespace WandEnhancer.View.Popups
{
    public partial class PatchVectorsPopup : UserControl
    {
        private const string JavaScriptDialogFilter = "JavaScript files (*.js)|*.js";

        private readonly Action<PatchConfig> _onApply;
        private readonly ObservableCollection<SelectedScript> _selectedScripts = new ObservableCollection<SelectedScript>();

        public PatchVectorsPopup(Action<PatchConfig> onApply)
        {
            _onApply = onApply;
            InitializeComponent();
            ScriptList.ItemsSource = _selectedScripts;
            LoadStrategies();
            UpdateScriptsEmptyState();
        }

        private void LoadStrategies()
        {
            StrategyComboBox.ItemsSource = new[]
            {
                new StrategyItem(EPatchStrategy.Static, LocalizationManager.Get("pv_strategy_static")),
                new StrategyItem(EPatchStrategy.Supervised, LocalizationManager.Get("pv_strategy_supervised"))
            };
            StrategyComboBox.SelectedIndex = 0; // Static is the default
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

            foreach (var path in dialog.FileNames.Where(WeModInstalls.IsJavaScriptFile))
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
                Strategy = (StrategyComboBox.SelectedItem as StrategyItem)?.Strategy ?? EPatchStrategy.Static,
                CustomScriptPaths = _selectedScripts.Select(script => script.FullPath).ToList(),
                AutoApplyAfterUpdate = AutoApplyBox.IsChecked == true
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

        private void UpdateScriptsEmptyState()
        {
            NoScriptsText.Visibility = _selectedScripts.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        private sealed class StrategyItem
        {
            public StrategyItem(EPatchStrategy strategy, string displayName)
            {
                Strategy = strategy;
                DisplayName = displayName;
            }

            public EPatchStrategy Strategy { get; }

            public string DisplayName { get; }
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