using System.ComponentModel;

namespace WandEnhancer.Core
{
    /// <summary>
    /// A bare error number in a log is one more thing to look up, and the people reading these
    /// logs are the ones filing the report. Windows already has the words for it.
    /// </summary>
    internal static class Win32Error
    {
        public static string Describe(int error)
        {
            return $"win32 error {error} ({new Win32Exception(error).Message})";
        }
    }
}
