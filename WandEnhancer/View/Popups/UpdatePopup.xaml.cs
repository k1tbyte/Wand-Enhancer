using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace WandEnhancer.View.Popups
{
    public partial class UpdatePopup : UserControl
    {
        private readonly Action _onUpdate;
        private readonly Func<Task<string>> _loadFullChangelog;
        private readonly string _latestNotes;
        private string _fullChangelog;
        private bool _showingFullChangelog;

        public UpdatePopup(string currentVersion, string latestVersion, string latestNotes, Action onUpdate,
            Func<Task<string>> loadFullChangelog)
        {
            _onUpdate = onUpdate;
            _loadFullChangelog = loadFullChangelog;
            InitializeComponent();

            CurrentVersionValue.Text = currentVersion;
            LatestVersionValue.Text = latestVersion;
            _latestNotes = string.IsNullOrWhiteSpace(latestNotes)
                ? GetResourceText("up_release_notes_unavailable")
                : latestNotes;

            SetNotesText(_latestNotes);
            ShowMoreButton.Visibility = loadFullChangelog == null ? Visibility.Collapsed : Visibility.Visible;
        }

        private void OnUpdateClick(object sender, RoutedEventArgs e)
        {
            _onUpdate();
        }

        private async void OnShowMoreClick(object sender, RoutedEventArgs e)
        {
            if (_loadFullChangelog == null)
            {
                return;
            }

            if (_showingFullChangelog)
            {
                SetNotesText(_latestNotes);
                ShowMoreButton.Content = GetResourceText("up_show_more");
                _showingFullChangelog = false;
                return;
            }

            if (string.IsNullOrWhiteSpace(_fullChangelog))
            {
                ShowMoreButton.IsEnabled = false;
                ShowMoreButton.Content = GetResourceText("up_loading_changelog");

                try
                {
                    _fullChangelog = await _loadFullChangelog();
                }
                finally
                {
                    ShowMoreButton.IsEnabled = true;
                }
            }

            if (string.IsNullOrWhiteSpace(_fullChangelog))
            {
                ShowMoreButton.Content = GetResourceText("up_show_more");
                SetNotesText(string.Concat(
                    _latestNotes,
                    Environment.NewLine,
                    Environment.NewLine,
                    GetResourceText("up_changelog_failed")));
                return;
            }

            SetNotesText(_fullChangelog);
            ShowMoreButton.Content = GetResourceText("up_show_less");
            _showingFullChangelog = true;
        }

        private void SetNotesText(string text)
        {
            NotesTextBlock.Text = text ?? string.Empty;
            NotesScrollViewer.ScrollToTop();
        }

        private static string GetResourceText(string key)
        {
            return Application.Current.TryFindResource(key) as string ?? string.Empty;
        }
    }
}