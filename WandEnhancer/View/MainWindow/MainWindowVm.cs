using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using WandEnhancer.Core;
using WandEnhancer.Core.Services;
using WandEnhancer.Models;
using WandEnhancer.ReactiveUICore;
using WandEnhancer.Utils;
using WandEnhancer.View.Popups;
using Application = System.Windows.Application;

namespace WandEnhancer.View.MainWindow
{
    public class MainWindowVm : ObservableObject
    {
        private const string LogExportFilter = "Text files (*.txt)|*.txt|All files (*.*)|*.*";

        private readonly IShellView _shell;
        private readonly IFileDialogs _dialogs;
        public ObservableCollection<LogEntry> LogList { get; } = new ObservableCollection<LogEntry>();
        private WeModConfig _weModConfig;

        public WeModConfig WeModInfo
        {
            get => _weModConfig;
            set => SetProperty(ref _weModConfig, value);
        }

        private void UseInstall(WeModConfig config)
        {
            WeModInfo = config;
            if (config == null)
            {
                return;
            }

            Log(LocalizationManager.Format("log_install_found", config, config.ExecutableName), ELogType.Success);
            AlreadyPatched = Enhancer.IsPatched(config.RootDirectory);
            IsPatchEnabled = !AlreadyPatched;

            Log(LocalizationManager.Get(AlreadyPatched ? "log_already_patched" : "log_ready"),
                AlreadyPatched ? ELogType.Warn : ELogType.Info);
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

        private bool _isBusy;

        /// <summary>True while a patch or restore runs; both are long file operations.</summary>
        public bool IsBusy
        {
            get => _isBusy;
            set
            {
                if (SetProperty(ref _isBusy, value))
                {
                    OnPropertyChanged(nameof(IsIdle));
                }
            }
        }

        /// <summary>Bound by buttons that must not be clickable a second time mid-run.</summary>
        public bool IsIdle => !_isBusy;

        public RelayCommand SetFolderPathCommand { get; }
        public RelayCommand ApplyPatchCommand { get; }
        public RelayCommand RestoreBackupCommand { get; }
        public RelayCommand OpenSettingsCommand { get; }
        public RelayCommand CopyLogsCommand { get; }
        public RelayCommand ExportLogsCommand { get; }

        private void OnFolderPathSelection(object obj)
        {
            string selectedPath = _dialogs.PickFolder(
                LocalizationManager.Get("dialog_pick_install"),
                Environment.GetEnvironmentVariable("LOCALAPPDATA"));
            if (selectedPath == null)
            {
                return;
            }

            var info = WeModInstalls.CheckWeModPath(selectedPath);
            if (info == null)
            {
                Log(LocalizationManager.Format("log_invalid_directory", Path.GetFileName(selectedPath)), ELogType.Error);
                return;
            }

            UseInstall(info);
        }

        // Restore does the same heavy file IO as Patch, so it runs off the UI thread too.
        private async void OnBackupRestoring(object param)
        {
            if (WeModInfo == null)
            {
                Log(LocalizationManager.Get("log_no_directory"), ELogType.Warn);
                return;
            }

            IsBusy = true;
            bool restored = await Task.Run(() =>
            {
                try
                {
                    new Enhancer(WeModInfo, Log).Restore();
                    return true;
                }
                catch (Exception e)
                {
                    Log(LocalizationManager.Format("log_restore_failed", e.Message), ELogType.Error);
                    return false;
                }
            });

            IsBusy = false;
            if (restored)
            {
                AlreadyPatched = false;
                IsPatchEnabled = true;
            }
        }

        private void OnPatching(object param)
        {
            if (WeModInfo == null)
            {
                Log(LocalizationManager.Get("log_no_directory"), ELogType.Warn);
                return;
            }

            _shell.OpenPopup(new PatchVectorsPopup(async config =>
            {
                _shell.ClosePopup();
                IsPatchEnabled = false;
                IsBusy = true;
                await Task.Run(() =>
                {
                    try
                    {
                        new Enhancer(WeModInfo, Log, config).Patch();
                        AlreadyPatched = true;
                    }
                    catch (Exception e)
                    {
                        Log(LocalizationManager.Format("log_patch_failed", e.Message), ELogType.Error);
                        IsPatchEnabled = true;
                    }
                });
                IsBusy = false;
            }), LocalizationManager.Get("pv_popup_title"));
        }

        private void Log(string message, ELogType logType)
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                var entry = new LogEntry
                {
                    LogType = logType,
                    Message = $"[{logType.ToString().ToUpper()}] {message}"
                };
                LogList.Add(entry);
                _shell.ScrollLogIntoView(entry);
                // The log commands are disabled while the list is empty, and appending a line
                // is not user input, so nothing else would re-evaluate CanExecute.
                System.Windows.Input.CommandManager.InvalidateRequerySuggested();
            });
        }

        private void OnOpenSettings(object param)
        {
            _shell.OpenPopup(new SettingsPopup(), LocalizationManager.Get("settings_title"));
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
            try
            {
                System.Windows.Clipboard.SetText(BuildLogReport());
                Log(LocalizationManager.Get("log_copied"), ELogType.Success);
            }
            catch (Exception e)
            {
                Log(LocalizationManager.Format("log_copy_failed", e.Message), ELogType.Error);
            }
        }

        private void OnExportLogs(object param)
        {
            string path = _dialogs.PickSaveFile(
                LogExportFilter,
                $"wand-enhancer-log-{DateTime.Now:yyyyMMdd-HHmmss}.txt");
            if (path == null)
            {
                return;
            }

            try
            {
                File.WriteAllText(path, BuildLogReport());
                Log(LocalizationManager.Format("log_exported", path), ELogType.Success);
            }
            catch (Exception e)
            {
                Log(LocalizationManager.Format("log_export_failed", e.Message), ELogType.Error);
            }
        }

        private bool HasLogs(object param) => LogList.Count > 0;

        /// <summary>The shell could not hand the repository URL to a browser; show it instead.</summary>
        public void ReportRepositoryLinkFailure(string url)
        {
            Log(LocalizationManager.Format("log_open_link_failed", url), ELogType.Warn);
        }

        public MainWindowVm(IShellView shell, IFileDialogs dialogs)
        {
            _shell = shell;
            _dialogs = dialogs;
            SetFolderPathCommand = new RelayCommand(OnFolderPathSelection);
            ApplyPatchCommand = new RelayCommand(OnPatching);
            RestoreBackupCommand = new RelayCommand(OnBackupRestoring);
            OpenSettingsCommand = new RelayCommand(OnOpenSettings);
            CopyLogsCommand = new RelayCommand(OnCopyLogs, HasLogs);
            ExportLogsCommand = new RelayCommand(OnExportLogs, HasLogs);

            UseInstall(WeModInstalls.FindWeMod());
            if (WeModInfo == null)
            {
                Log(LocalizationManager.Get("log_install_not_found"), ELogType.Error);
            }

            foreach (var entry in Program.StartupLog)
            {
                Log(entry.Key, entry.Value);
            }
            Program.StartupLog.Clear();
        }
    }
}
