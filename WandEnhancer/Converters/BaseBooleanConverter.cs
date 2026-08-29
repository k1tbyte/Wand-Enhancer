using System;
using System.Collections.Generic;
using System.Globalization;
using System.Windows.Data;

namespace WandEnhancer.Converters
{
    public abstract class BaseBooleanConverter<T> : IValueConverter
    {
        protected BaseBooleanConverter(T trueValue, T falseValue)
        {
            True = trueValue;
            False = falseValue;
        }

        protected T True { get; set; }
        protected T False { get; set; }

        public virtual object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            return value is bool booleanValue && booleanValue ? True : False;
        }

        public virtual object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            return value is T t && EqualityComparer<T>.Default.Equals(t, True);
        }
    }
}