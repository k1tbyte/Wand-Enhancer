using System;
using System.IO;
using WandEnhancer.View.MainWindow;

namespace WandEnhancer.Core
{
    /// <summary>
    /// Append-only log written next to the deployed launcher. Launch mode has no window and
    /// exits as soon as Wand is up, so without this file a "Wand does not start" report
    /// carries no evidence at all. Every operation swallows its own failure: diagnostics must
    /// never be the reason Wand fails to launch.
    /// </summary>
    internal static class LauncherLog
    {
        public const string FileName = "launcher.log";
        public const string PreviousFileName = "launcher.prev.log";
        private const long MaxBytes = 512 * 1024;

        private static string _path;

        public static void Open(string launcherDirectory, string header)
        {
            try
            {
                string path = Path.Combine(launcherDirectory, FileName);
                var file = new FileInfo(path);
                // Rotated whole rather than trimmed. One generation is kept because the run
                // worth reading is often the one before the restart that rolled the file.
                if (file.Exists && file.Length > MaxBytes)
                {
                    string previous = Path.Combine(launcherDirectory, PreviousFileName);
                    File.Delete(previous);
                    file.MoveTo(previous);
                }

                _path = path;
                Write($"=== {DateTime.Now:yyyy-MM-dd} {header}", ELogType.Info);
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException ||
                                      e is ArgumentException || e is NotSupportedException)
            {
                _path = null;
            }
        }

        public static void Write(string message, ELogType type)
        {
            if (_path == null)
            {
                return;
            }

            try
            {
                File.AppendAllText(_path,
                    $"{DateTime.Now:HH:mm:ss.fff} [{type.ToString().ToUpperInvariant()}] {message}{Environment.NewLine}");
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                // A log line lost to a locked or full disk must not abort the launch.
            }
        }
    }
}
