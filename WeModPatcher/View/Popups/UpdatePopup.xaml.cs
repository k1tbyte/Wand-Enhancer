using System;
using System.Windows;
using System.Windows.Controls;

namespace WeModPatcher.View.Popups
{
    public partial class UpdatePopup : UserControl
    {
        private readonly Action _onUpdate;

        public UpdatePopup(Action onUpdate)
        {
            _onUpdate = onUpdate;
            InitializeComponent();
        }

        private void OnUpdateClick(object sender, RoutedEventArgs e)
        {
            _onUpdate();
        }
    }
}