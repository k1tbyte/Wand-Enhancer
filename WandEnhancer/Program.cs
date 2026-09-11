using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using WandEnhancer.Core;
using WandEnhancer.Core.Patching.Strategies;
using WandEnhancer.Models;
using WandEnhancer.Utils;
using WandEnhancer.View.MainWindow;

namespace WandEnhancer
{
    public static class Program
    {
        /// <summary>Log lines from a failed startup auto-patch, replayed by the UI when it opens.</summary>
        public static readonly List<KeyValuePair<string, ELogType>> StartupLog =
            new List<KeyValuePair<string, ELogType>>();

        [STAThread]
        public static void Main(string[] args)
        {
            // Attached first: launch mode has no window of its own, so a crash in there would
            // otherwise be a Windows error box with none of our own words in it.
            AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
            TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

            if (TryLaunchMode(args))
                return;

            bool startupFailed = StartupLog.Exists(entry => entry.Value == ELogType.Error);

            var application = new App();
            application.InitializeComponent();
            var window = new MainWindow();

            // Launch mode is headless, so replay errors into the UI if startup failed.
            if (startupFailed)
                window.Loaded += (sender, e) => BringToFront(window);

            application.MainWindow = window;
            application.Run();
        }

        private static bool TryLaunchMode(string[] args)
        {
            string myExe = Assembly.GetExecutingAssembly().Location;
            string myName = Path.GetFileNameWithoutExtension(myExe);

            if (!Constants.WeModBrandNames.Any(
                    n => n.Equals(myName, StringComparison.OrdinalIgnoreCase)))
                return false;

            string myDir = Path.GetDirectoryName(myExe);
            string forwardedArgs = args.Length > 0 ? QuoteArguments(args) : null;

            var patchConfig = Enhancer.LoadAutoPatchConfig(myDir);

            LauncherLog.Open(myDir, $"WandEnhancer {Constants.Version} build {Constants.Build} | " +
                                    $"patches {DescribePatches(patchConfig)} | {myExe}" +
                                    (forwardedArgs == null ? "" : $" | args {forwardedArgs}"));

            if (args.Length > 0 &&
                args[0].StartsWith("--squirrel", StringComparison.OrdinalIgnoreCase))
            {
                string updateExe = Path.Combine(myDir, "Update.exe");
                if (File.Exists(updateExe))
                {
                    LauncherLog.Write($"Squirrel hook {args[0]} forwarded to Update.exe.", ELogType.Info);
                    Process.Start(updateExe, QuoteArguments(args));
                }
                else
                {
                    LauncherLog.Write($"Squirrel hook {args[0]} ignored: Update.exe is missing.", ELogType.Warn);
                }

                return true;
            }

            var config = WeModInstalls.FindLatestWeMod(myDir);
            if (config == null)
            {
                // RecordStartupLog, not LauncherLog.Write: the window is about to open, and this is
                // the line that explains why.
                RecordStartupLog($"No Wand install found under {myDir}; opening the UI instead.", ELogType.Error);
                return false;
            }

            bool isPatched = Enhancer.IsPatched(config.RootDirectory);
            LauncherLog.Write($"Install {config.ExecutablePath} is {(isPatched ? "patched" : "not patched")}.",
                ELogType.Info);

            // Re-apply saved patches automatically on updates. Fall back to UI on failure.
            if (!isPatched && !TryAutoPatch(config, patchConfig))
                return false;

#if ENABLE_UPDATE_NOTIFICATIONS
            UpdateNotifier.CheckInBackground();
#endif

            // Use RecordStartupLog so launcher output survives into the UI on failure.
            var strategy = StrategyFactory.Create(patchConfig?.Strategy ?? EPatchStrategy.Supervised);
            return strategy.Launch(new PatchContext(config, RecordStartupLog), forwardedArgs);
        }


        private static void BringToFront(System.Windows.Window window)
        {
            window.WindowState = System.Windows.WindowState.Normal;
            window.Topmost = true;
            window.Activate();
            window.Topmost = false;
        }


        private static string QuoteArguments(IEnumerable<string> args)
        {
            return string.Join(" ", args.Select(QuoteArgument));
        }

        private static string QuoteArgument(string value)
        {
            if (!string.IsNullOrEmpty(value) && value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0)
            {
                return value;
            }

            // Backslashes are literal unless they run into the closing quote, where they double.
            var quoted = new System.Text.StringBuilder("\"");
            int backslashes = 0;
            foreach (char current in value ?? string.Empty)
            {
                if (current == '\\')
                {
                    backslashes++;
                    continue;
                }

                if (current == '"')
                {
                    quoted.Append('\\', backslashes * 2 + 1).Append('"');
                }
                else
                {
                    quoted.Append('\\', backslashes).Append(current);
                }

                backslashes = 0;
            }

            return quoted.Append('\\', backslashes * 2).Append('"').ToString();
        }

        /// <summary>
        /// Describes applied patches for diagnostic logs. Unrecorded if auto-patch is off.
        /// </summary>
        private static string DescribePatches(PatchConfig patchConfig)
        {
            if (patchConfig?.PatchTypes == null)
                return "unrecorded";

            return patchConfig.PatchTypes.Count == 0 ? "none" : string.Join(",", patchConfig.PatchTypes);
        }

        private static bool TryAutoPatch(WeModConfig config, PatchConfig patchConfig)
        {
            if (patchConfig == null || !patchConfig.AutoApplyAfterUpdate)
                return true; // nothing to replay; launch as-is

            try
            {
                new Enhancer(config, RecordStartupLog, patchConfig).Patch();
                return true;
            }
            catch (Exception e)
            {
                // Localization resources are not loaded yet in launcher mode (no Application),
                // so these two replay into the UI log in English by design.
                RecordStartupLog($"Auto-patch failed: {e.Message}", ELogType.Error);
                RecordStartupLog("The new Wand version may need updated patches. Restore the backup and patch again.", ELogType.Warn);
                return false;
            }
        }

        /// <summary>Buffers logs for the UI and mirrors them to disk for headless runs.</summary>
        private static void RecordStartupLog(string message, ELogType type)
        {
            StartupLog.Add(new KeyValuePair<string, ELogType>(message, type));
            LauncherLog.Write(message, type);
        }
        
        
        // Handle unawaited task exceptions so they do not crash the application.
        private static void OnUnobservedTaskException(object sender, UnobservedTaskExceptionEventArgs e)
        {
            e.SetObserved();
            RecordStartupLog($"Background task failed: {e.Exception.GetBaseException().Message}", ELogType.Error);
        }

        private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            var error = e.ExceptionObject as Exception;
            MessageBox.Show(
                error?.Message ?? e.ExceptionObject?.ToString() ?? "Unknown error",
                Constants.RepoName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Environment.Exit(1);
        }
    }
}