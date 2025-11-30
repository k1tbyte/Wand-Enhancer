using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using WeModPatcher.Core;
using WeModPatcher.Models;
using WeModPatcher.ReactiveUICore;
using WeModPatcher.Utils;
using WeModPatcher.View.Popups;
using Application = System.Windows.Application;

namespace WeModPatcher.View.MainWindow
{
    public class MainWindowVm : ObservableObject
    {
        private readonly MainWindow _view;
        public ObservableCollection<LogEntry> LogList { get; set; } = new ObservableCollection<LogEntry>();
        private static Updater _updater = new Updater();

        private WeModConfig _weModConfig;

        public WeModConfig WeModInfo
        {
            get => _weModConfig;
            set
            {
                SetProperty(ref _weModConfig, value);
                if (value == null) return;

                Log($"WeMod directory found at '{_weModConfig}' ({_weModConfig.ExecutableName})", ELogType.Success);
                if (File.Exists(Path.Combine(_weModConfig.RootDirectory, "resources", "app.asar.backup")))
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

        private bool _isUpdateAvailable;

        public bool IsUpdateAvailable
        {
            get => _isUpdateAvailable;
            set => SetProperty(ref _isUpdateAvailable, value);
        }

        public RelayCommand SetFolderPathCommand { get; }
        public RelayCommand ApplyPatchCommand { get; }
        public RelayCommand RestoreBackupCommand { get; }
        public RelayCommand UpdateCommand { get; }

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
            var backupPath = Path.Combine(WeModInfo.RootDirectory, "resources", "app.asar.backup");
            if (!File.Exists(backupPath))
            {
                Log("Backup not found. Please dont delete it manually", ELogType.Error);
                return;
            }

            try
            {
                // Try to lock the file to see if it's in use
                using (File.Open(backupPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                {
                }
                
                var proxyDllPath = Path.Combine(WeModInfo.RootDirectory, "version.dll");
                
                if(File.Exists(proxyDllPath))
                {
                    File.Delete(proxyDllPath);
                }
            }
            catch
            {
                Log("Backup file is locked. Please close the WeMod and try again.", ELogType.Error);
                return;
            }

            File.Copy(backupPath, Path.Combine(WeModInfo.RootDirectory, "resources", "app.asar"), true);
            File.Delete(backupPath);
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
                        new Patcher(WeModInfo, Log, config).Patch();
                        AlreadyPatched = true;
                    }
                    catch (Exception e)
                    {
                        Log($"Failed to patch: {e.Message}", ELogType.Error);
                        IsPatchEnabled = true;
                    }
                });
            }), "What are we gonna patch?");
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

        private void OnUpdate(object param)
        {
            MainWindow.Instance.OpenPopup(new UpdatePopup(() =>
            {
                Task.Run(async () =>
                {
                    try
                    {
                        await _updater.Update();
                    }
                    catch (Exception e)
                    {
                        Log($"Failed to update: {e.Message}", ELogType.Error);
                        return;
                    }

                    Log("WeModPatcher updated successfully. Restarting...", ELogType.Success);
                });
            }), "Update available!");
        }

        public MainWindowVm(MainWindow view)
        {
            Task.Run(async () => IsUpdateAvailable = await _updater.CheckForUpdates());
            _view = view;
            SetFolderPathCommand = new RelayCommand(OnFolderPathSelection);
            ApplyPatchCommand = new RelayCommand(OnPatching);
            RestoreBackupCommand = new RelayCommand(OnBackupRestoring);
            UpdateCommand = new RelayCommand(OnUpdate);

            WeModInfo = Extensions.FindWeMod();
            if (WeModInfo == null)
            {
                Log("WeMod directory not found.", ELogType.Error);
            }
        }
    }
}