using System.Windows;

namespace WandEnhancer.Converters
{
    internal sealed class ToVisibilityConverter : BaseBooleanConverter<Visibility>
    {
        public ToVisibilityConverter() :
            base(Visibility.Visible, Visibility.Collapsed)
        { }
    }

}