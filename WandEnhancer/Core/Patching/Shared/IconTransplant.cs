using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace WandEnhancer.Core.Patching.Shared
{
    /// <summary>
    /// Copies one executable's icon into another by transplanting its RT_GROUP_ICON and RT_ICON
    /// resources. The deployed launcher replaces Wand's stub that user shortcuts point at, so it
    /// wears Wand's own icon to stay transparent. Only Win32 icon resources change; the managed
    /// image is untouched. The group is rewritten at id 1 so the shell always prefers it.
    /// </summary>
    internal static class IconTransplant
    {
        private const int RT_ICON = 3;
        private const int RT_GROUP_ICON = 14;
        private const uint LOAD_LIBRARY_AS_DATAFILE = 0x00000002;
        private const ushort LangNeutral = 0;
        private const int GroupHeader = 6;   // reserved, type, count
        private const int GroupEntry = 14;   // GRPICONDIRENTRY: 12 bytes + WORD id

        public static bool Copy(string fromExe, string toExe)
        {
            IntPtr source = LoadLibraryEx(fromExe, IntPtr.Zero, LOAD_LIBRARY_AS_DATAFILE);
            if (source == IntPtr.Zero)
            {
                return false;
            }

            try
            {
                IntPtr groupName = FindFirstGroupName(source);
                byte[] group = groupName == IntPtr.Zero
                    ? null
                    : LoadResourceBytes(source, groupName, (IntPtr)RT_GROUP_ICON);
                if (group == null || group.Length < GroupHeader)
                {
                    return false;
                }

                int count = BitConverter.ToUInt16(group, 4);
                if (group.Length < GroupHeader + count * GroupEntry)
                {
                    return false;
                }

                // Reindex every image to a contiguous 1..N so the rewritten group is self-consistent.
                var images = new List<byte[]>(count);
                var rebuilt = new byte[GroupHeader + count * GroupEntry];
                Array.Copy(group, 0, rebuilt, 0, GroupHeader);

                for (int i = 0; i < count; i++)
                {
                    int entry = GroupHeader + i * GroupEntry;
                    ushort sourceId = BitConverter.ToUInt16(group, entry + 12);
                    byte[] image = LoadResourceBytes(source, (IntPtr)sourceId, (IntPtr)RT_ICON);
                    if (image == null)
                    {
                        return false;
                    }

                    images.Add(image);
                    Array.Copy(group, entry, rebuilt, entry, 12);
                    ushort newId = (ushort)(i + 1);
                    rebuilt[entry + 12] = (byte)(newId & 0xFF);
                    rebuilt[entry + 13] = (byte)(newId >> 8);
                }

                return WriteIcon(toExe, images, rebuilt);
            }
            finally
            {
                FreeLibrary(source);
            }
        }

        private static bool WriteIcon(string toExe, List<byte[]> images, byte[] group)
        {
            IntPtr update = BeginUpdateResource(toExe, false);
            if (update == IntPtr.Zero)
            {
                return false;
            }

            for (int i = 0; i < images.Count; i++)
            {
                if (!UpdateResource(update, (IntPtr)RT_ICON, (IntPtr)(i + 1), LangNeutral, images[i], (uint)images[i].Length))
                {
                    EndUpdateResource(update, true);
                    return false;
                }
            }

            if (!UpdateResource(update, (IntPtr)RT_GROUP_ICON, (IntPtr)1, LangNeutral, group, (uint)group.Length))
            {
                EndUpdateResource(update, true);
                return false;
            }

            return EndUpdateResource(update, false);
        }

        private static IntPtr FindFirstGroupName(IntPtr module)
        {
            IntPtr found = IntPtr.Zero;
            EnumResNameProc callback = (m, t, name, l) =>
            {
                found = name;
                return false; // first group is the icon the shell shows; stop
            };
            EnumResourceNames(module, (IntPtr)RT_GROUP_ICON, callback, IntPtr.Zero);
            GC.KeepAlive(callback);
            return found;
        }

        private static byte[] LoadResourceBytes(IntPtr module, IntPtr name, IntPtr type)
        {
            IntPtr info = FindResource(module, name, type);
            if (info == IntPtr.Zero)
            {
                return null;
            }

            uint size = SizeofResource(module, info);
            IntPtr handle = LoadResource(module, info);
            if (size == 0 || handle == IntPtr.Zero)
            {
                return null;
            }

            IntPtr ptr = LockResource(handle);
            if (ptr == IntPtr.Zero)
            {
                return null;
            }

            var bytes = new byte[size];
            Marshal.Copy(ptr, bytes, 0, (int)size);
            return bytes;
        }

        private delegate bool EnumResNameProc(IntPtr hModule, IntPtr lpszType, IntPtr lpszName, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr LoadLibraryEx(string lpFileName, IntPtr hFile, uint dwFlags);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FreeLibrary(IntPtr hModule);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool EnumResourceNames(IntPtr hModule, IntPtr lpszType, EnumResNameProc lpEnumFunc, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindResource(IntPtr hModule, IntPtr lpName, IntPtr lpType);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr LoadResource(IntPtr hModule, IntPtr hResInfo);

        [DllImport("kernel32.dll")]
        private static extern IntPtr LockResource(IntPtr hResData);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint SizeofResource(IntPtr hModule, IntPtr hResInfo);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cb);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);
    }
}
