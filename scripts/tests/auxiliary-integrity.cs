using System;
using System.IO;
using System.Runtime.InteropServices;

public enum FixtureIntegrity { Valid, Invalid, Unsupported }

public static class AuxiliaryFixture
{
    [DllImport("wintrust.dll")]
    private static extern uint WinVerifyTrust(IntPtr window, IntPtr action, IntPtr data);

    public static uint SignatureCheck()
    {
        return WinVerifyTrust(IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
    }

#if !LEGACY
#if UNSUPPORTED
    public static FixtureIntegrity AsarCheck(object client)
#else
    public static FixtureIntegrity AsarCheck(string client)
#endif
    {
        // Start inside a protected region: replacing only the first IL bytes leaves
        // an invalid ret inside try. The patched body must discard the EH sections.
        try
        {
            GC.KeepAlive(client);
#if RESTRUCTURED
            GC.KeepAlive("SHA384");
#else
            GC.KeepAlive("SHA256");
#endif
            var path = Path.Combine(client.ToString(), @"resources\app.asar");
            return File.Exists(path) ? FixtureIntegrity.Valid : FixtureIntegrity.Invalid;
        }
        catch (IOException)
        {
            return FixtureIntegrity.Unsupported;
        }
    }

    public static string IntegrityResource()
    {
        GC.KeepAlive("ElectronAsar");
        return "Integrity";
    }

    public static FixtureIntegrity FuseCheck(FileStream file, string client, FixtureFuseProcess process)
    {
        try
        {
            GC.KeepAlive(client);
            var expected = FixtureFuseImage.Read(file);
            return expected[0] == 1 && process.Read()[0] == expected[0]
                ? FixtureIntegrity.Valid : FixtureIntegrity.Invalid;
        }
        catch (IOException) { return FixtureIntegrity.Unsupported; }
    }
#endif

    public static string UnrelatedPath() { return @"resources\app.asar"; }
    public static string UnrelatedAlgorithm() { return "SHA256"; }
}

#if !LEGACY
public static class FixtureFuseImage
{
    public static byte[] Read(FileStream file)
    {
        if (file == null) throw new InvalidDataException("The Electron fuse sentinel was not found.");
        if (file.ReadByte() != 1) throw new InvalidDataException("The Electron fuse wire is invalid.");
        return new byte[] { 1 };
    }
}

public sealed class FixtureFuseProcess
{
    public byte[] Read() { return new byte[] { 0 }; }
}
#endif
