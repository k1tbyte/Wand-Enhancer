using System.Windows;

namespace WandEnhancer.View.MainWindow
{
    /// <summary>
    /// Abstract shell window for the view model. Keeps commands testable.
    /// </summary>
    public interface IShellView
    {
        void OpenPopup(FrameworkElement content, string title);
        void ClosePopup();
        void ScrollLogIntoView(LogEntry entry);
    }

    /// <summary>Modal file/folder pickers, isolated for testability.</summary>
    public interface IFileDialogs
    {
        /// <summary>Chosen folder, or null when cancelled.</summary>
        string PickFolder(string description, string initialPath);

        /// <summary>Chosen file path, or null when cancelled.</summary>
        string PickSaveFile(string filter, string suggestedFileName);
    }
}
