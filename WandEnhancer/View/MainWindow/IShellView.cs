using System.Windows;

namespace WandEnhancer.View.MainWindow
{
    /// <summary>
    /// What the view model needs from the shell window. Exists so the view model does not
    /// hold the concrete window or reach through a static Instance, which made every command
    /// untestable and crashed whenever the singleton was not set yet.
    /// </summary>
    public interface IShellView
    {
        void OpenPopup(FrameworkElement content, string title);
        void ClosePopup();
        void ScrollLogIntoView(LogEntry entry);
    }

    /// <summary>Modal file/folder pickers, kept behind a seam so commands stay headless-testable.</summary>
    public interface IFileDialogs
    {
        /// <summary>Chosen folder, or null when cancelled.</summary>
        string PickFolder(string description, string initialPath);

        /// <summary>Chosen file path, or null when cancelled.</summary>
        string PickSaveFile(string filter, string suggestedFileName);
    }
}
