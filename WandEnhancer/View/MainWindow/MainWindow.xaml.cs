using System;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;

namespace WandEnhancer.View.MainWindow
{
    /// <summary>
    /// Interaction logic for MainWindow.xaml
    /// </summary>
    public partial class MainWindow : IShellView
    {
        public static MainWindow Instance;
        public readonly MainWindowVm ViewModel;

        public MainWindow()
        {
            InitializeComponent();
            this.ViewModel = new MainWindowVm(this, new WindowsFileDialogs());
            this.DataContext = ViewModel;
            VersionLabel.Text = Constants.Version.ToString();
            Instance = this;
        }

        public void OpenPopup(FrameworkElement content, string title = null)
        {
            this.PopupHost.PopupContent = content;
            PopupHost.Title.Text = title;
            PopupHost.IsOpen = true;
        }

        public void ScrollLogIntoView(LogEntry entry)
        {
            this.LogList.ScrollIntoView(entry);
        }

        // Preview (tunneling) events: the read-only text boxes reject file drops in their own class handlers before a bubbling handler runs.
        private void OnDragOver(object sender, DragEventArgs e)
        {
            if (!e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                return;
            }

            e.Effects = PopupHost.IsOpen ? DragDropEffects.None : DragDropEffects.Link;
            e.Handled = true;
        }

        private async void OnDrop(object sender, DragEventArgs e)
        {
            if (PopupHost.IsOpen || !(e.Data.GetData(DataFormats.FileDrop) is string[] paths) || paths.Length == 0)
            {
                return;
            }

            e.Handled = true;
            await ViewModel.UseInstallPathAsync(paths[0]);
        }

        private void OnDragMove(object sender, MouseButtonEventArgs e)
        {
            this.DragMove();
        }

        private void OnClosing(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

        public void ClosePopup()
        {
            PopupHost.IsOpen = false;
        }

        private void OpenSourceClicked(object sender, MouseButtonEventArgs e)
        {
            // Try to open link, do not crash if it fails.
            try
            {
                System.Diagnostics.Process.Start(Constants.RepositoryUrl);
            }
            catch (Exception)
            {
                ViewModel.ReportRepositoryLinkFailure(Constants.RepositoryUrl);
            }
        }
    }
}