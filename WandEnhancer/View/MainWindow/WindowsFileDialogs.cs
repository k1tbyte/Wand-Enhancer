using System.Windows.Forms;

namespace WandEnhancer.View.MainWindow
{
    internal sealed class WindowsFileDialogs : IFileDialogs
    {
        public string PickFolder(string description, string initialPath)
        {
            using (var dialog = new FolderBrowserDialog
            {
                SelectedPath = initialPath,
                Description = description,
                ShowNewFolderButton = false,
            })
            {
                return dialog.ShowDialog() == DialogResult.OK ? dialog.SelectedPath : null;
            }
        }

        public string PickSaveFile(string filter, string suggestedFileName)
        {
            using (var dialog = new SaveFileDialog { Filter = filter, FileName = suggestedFileName })
            {
                return dialog.ShowDialog() == DialogResult.OK ? dialog.FileName : null;
            }
        }
    }
}
