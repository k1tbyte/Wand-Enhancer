using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using WandEnhancer.Core;
using WandEnhancer.Models;
using WandEnhancer.ReactiveUICore;
using WandEnhancer.Utils;
using WandEnhancer.View.Popups;
using Application = System.Windows.Application;

namespace WandEnhancer.View.MainWindow
{
    public class MainWindowVm : ObservableObject
    {
        private readonly MainWindow _view;
        public ObservableCollection<LogEntry> LogList { get; set; } = new ObservableCollection<LogEntry>();
        private WeModConfig _weModConfig;

        public WeModConfig WeModInfo
        {
            get => _weModConfig;
            set
            {
                SetProperty(ref _weModConfig, value);
                if (value == null) return;

                Log($"WeMod directory found at '{_weModConfig}' ({_weModConfig.ExecutableName})", ELogType.Success);
                var resourcesPath = Path.Combine(_weModConfig.RootDirectory, "resources");
                if (File.Exists(Path.Combine(resourcesPath, "app.asar.backup")) ||
                    Directory.Exists(Path.Combine(resourcesPath, "app.asar.unpacked.backup")))
                {
                    Log("WeMod already patched. If you want to patch again, please restore the backup first.",
                        ELogType.Warn);
                    IsPatchEnabled = false;
                    AlreadyPatched = true;
                    return;
                }

                Log("Ready for patching.", ELogType.Info);
                IsPatchEnabled = true;
            }
        }

        private bool _isPatchEnabled;

        public bool IsPatchEnabled
        {
            get => _isPatchEnabled;
            set => SetProperty(ref _isPatchEnabled, value);
        }

        private bool _alreadyPatched;

        public bool AlreadyPatched
        {
            get => _alreadyPatched;
            set => SetProperty(ref _alreadyPatched, value);
        }

        public RelayCommand SetFolderPathCommand { get; }
        public RelayCommand ApplyPatchCommand { get; }
        public RelayCommand RestoreBackupCommand { get; }
        public RelayCommand OpenSettingsCommand { get; }
        public RelayCommand CopyLogsCommand { get; }
        public RelayCommand ExportLogsCommand { get; }

        private void OnFolderPathSelection(object obj)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.SelectedPath = Environment.GetEnvironmentVariable("LOCALAPPDATA");
                dialog.Description = "Select the WeMod directory";
                dialog.ShowNewFolderButton = false;

                if (dialog.ShowDialog() != DialogResult.OK) return;
                string selectedPath = dialog.SelectedPath;
                string fileName = Path.GetFileName(selectedPath);

                var info = Extensions.CheckWeModPath(selectedPath);

                if (info != null)
                {
                    WeModInfo = info;
                    return;
                }

                LogList.Add(new LogEntry
                {
                    LogType = ELogType.Error,
                    Message = $"The selected folder '{fileName}' is not a valid WeMod directory."
                });
            }
        }

        private void OnBackupRestoring(object param)
        {
            var resourcesPath = Path.Combine(WeModInfo.RootDirectory, "resources");
            var backupPath = Path.Combine(resourcesPath, "app.asar.backup");
            var unpackedBackupPath = Path.Combine(resourcesPath, "app.asar.unpacked.backup");
            if (!File.Exists(backupPath) || !Directory.Exists(unpackedBackupPath))
            {
                Log("Backup is incomplete. Restore the original Wand installation files or reinstall Wand.", ELogType.Error);
                return;
            }

            try
            {
                var asarPath = Path.Combine(resourcesPath, "app.asar");
                var unpackedPath = Path.Combine(resourcesPath, "app.asar.unpacked");
                File.Copy(backupPath, asarPath, true);

                if (Directory.Exists(unpackedPath))
                {
                    Directory.Delete(unpackedPath, true);
                }
                Enhancer.CopyDirectory(unpackedBackupPath, unpackedPath);

                var proxyDllPath = Path.Combine(WeModInfo.RootDirectory, "version.dll");
                if (File.Exists(proxyDllPath))
                {
                    File.Delete(proxyDllPath);
                }

                File.Delete(backupPath);
                Directory.Delete(unpackedBackupPath, true);
            }
            catch (Exception e)
            {
                Log($"Failed to restore backup: {e.Message}", ELogType.Error);
                return;
            }

            Log("Backup restored successfully.", ELogType.Success);
            AlreadyPatched = false;
            IsPatchEnabled = true;
        }

        private void OnPatching(object param)
        {
            if (WeModInfo == null)
            {
                Log("Can't be done. Please specify the directory first.", ELogType.Warn);
                return;
            }

            MainWindow.Instance.OpenPopup(new PatchVectorsPopup(async config =>
            {
                MainWindow.Instance.ClosePopup();
                IsPatchEnabled = false;
                await Task.Run(() =>
                {
                    try
                    {
                        new Enhancer(WeModInfo, Log, config).Patch();
                        AlreadyPatched = true;
                    }
                    catch (Exception e)
                    {
                        Log($"Failed to patch: {e.Message}", ELogType.Error);
                        IsPatchEnabled = true;
                    }
                });
            }), Application.Current.FindResource("pv_popup_title") as string);
        }

        private void Log(string message, ELogType logType)
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                message = $"[{logType.ToString().ToUpper()}] {message}";

                var entry = new LogEntry
                {
                    LogType = logType,
                    Message = message
                };
                LogList.Add(entry);
                _view.LogList.ScrollIntoView(entry);
            });
        }

        private void OnOpenSettings(object param)
        {
            MainWindow.Instance.OpenPopup(new SettingsPopup(), Application.Current.FindResource("settings_title") as string);
        }

        private string BuildLogReport()
        {
            var builder = new StringBuilder();
            foreach (var entry in LogList)
            {
                builder.AppendLine(entry.Message);
            }
            return builder.ToString();
        }

        private void OnCopyLogs(object param)
        {
            if (LogList.Count == 0)
            {
                return;
            }

            try
            {
                System.Windows.Clipboard.SetText(BuildLogReport());
                Log("Logs copied to clipboard.", ELogType.Success);
            }
            catch (Exception e)
            {
                Log($"Failed to copy logs: {e.Message}", ELogType.Error);
            }
        }

        private void OnExportLogs(object param)
        {
            if (LogList.Count == 0)
            {
                return;
            }

            using (var dialog = new SaveFileDialog
            {
                Filter = "Text files (*.txt)|*.txt|All files (*.*)|*.*",
                FileName = $"wand-enhancer-log-{DateTime.Now:yyyyMMdd-HHmmss}.txt"
            })
            {
                if (dialog.ShowDialog() != DialogResult.OK)
                {
                    return;
                }

                try
                {
                    File.WriteAllText(dialog.FileName, BuildLogReport());
                    Log($"Logs exported to '{dialog.FileName}'.", ELogType.Success);
                }
                catch (Exception e)
                {
                    Log($"Failed to export logs: {e.Message}", ELogType.Error);
                }
            }
        }

        public MainWindowVm(MainWindow view)
        {
            _view = view;
            SetFolderPathCommand = new RelayCommand(OnFolderPathSelection);
            ApplyPatchCommand = new RelayCommand(OnPatching);
            RestoreBackupCommand = new RelayCommand(OnBackupRestoring);
            OpenSettingsCommand = new RelayCommand(OnOpenSettings);
            CopyLogsCommand = new RelayCommand(OnCopyLogs);
            ExportLogsCommand = new RelayCommand(OnExportLogs);

            WeModInfo = Extensions.FindWeMod();
            if (WeModInfo == null)
            {
                Log("WeMod directory not found.", ELogType.Error);
            }
        }
    }
}
