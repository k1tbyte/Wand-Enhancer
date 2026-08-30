using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using WandEnhancer.Core;
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
            if (TryLaunchMode(args))
                return;

            AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
            TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

            bool startupFailed = StartupLog.Exists(entry => entry.Value == ELogType.Error);

            var application = new App();
            application.InitializeComponent();
            var window = new MainWindow();

            // Launch mode has no window at all, so a user whose Wand never opened would have to
            // be told where launcher.log lives. Put the same lines in front of them instead.
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

            LauncherLog.Open(myDir, $"WandEnhancer {Constants.Version} | {myExe}" +
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
                LauncherLog.Write($"No Wand install found under {myDir}; opening the UI instead.", ELogType.Error);
                return false;
            }

            bool isPatched = Enhancer.IsPatched(config.RootDirectory);
            LauncherLog.Write($"Install {config.ExecutablePath} is {(isPatched ? "patched" : "not patched")}.",
                ELogType.Info);

            // A fresh Wand version drops our patches; re-apply the saved selection automatically.
            // On failure fall through to the UI so the user sees which patch broke.
            if (!isPatched && !TryAutoPatch(config, myDir))
                return false;

            // RecordStartupLog, not LauncherLog.Write: whatever the launcher says has to survive
            // into the window on the failure path below.
            return FuseLauncher.Launch(config.ExecutablePath, forwardedArgs, RecordStartupLog);
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

        private static bool TryAutoPatch(WeModConfig config, string launcherDir)
        {
            var patchConfig = Enhancer.LoadAutoPatchConfig(launcherDir);
            if (patchConfig == null)
                return true; // nothing saved to replay; launch as-is

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

        /// <summary>Buffers for the UI and mirrors to disk: auto-patch runs headless, so the
        /// file is the only copy if the user never opens the window afterwards.</summary>
        private static void RecordStartupLog(string message, ELogType type)
        {
            StartupLog.Add(new KeyValuePair<string, ELogType>(message, type));
            LauncherLog.Write(message, type);
        }
        
        
        // Fires on the finalizer thread for a task nobody awaited. Non-fatal since .NET 4.5:
        // record it and mark it observed rather than killing a patch mid-run.
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