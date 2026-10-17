using System;
using System.IO;

namespace WandEnhancer.Core.Patching.Strategies.Static
{
    /// <summary>
    /// Wand 12.61 added an independent re-check, inside the auxiliary service, of the same
    /// Electron ASAR-integrity fuse byte <see cref="Shared.ElectronFuseWire"/> flips so a
    /// patched app.asar will load. Disabling that fuse (required for the patched asar to load
    /// at all) is exactly what this re-check treats as tampered, so it refuses to cooperate
    /// with trainer launches ("client_integrity_failed"). Stubs its predicate to always true.
    /// </summary>
    internal static class AuxFuseIntegrityNeutralizer
    {
        // Electron's own public @electron/fuses sentinel; stable across builds and unrelated
        // to Wand's own (per-build) obfuscation, unlike the method names around it.
        private const string FuseSentinel = "dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX";
        private static readonly byte[] Stub = { 0x17, 0x2A }; // ldc.i4.1; ret (always true)

        /// <returns>Methods stubbed, or -1 when the feature is absent from this build.</returns>
        public static int Neutralize(string auxPath, Action<string, ELogType> log)
        {
            long offset;
            using (DotNetImage image = DotNetImage.Load(auxPath))
            {
                if (image == null)
                {
                    log?.Invoke($"[ENHANCER] {Path.GetFileName(auxPath)} is not a managed image; leaving it alone.", ELogType.Warn);
                    return -1;
                }

                offset = image.FindBoolPredicateOffsetByTypeStringAnchor(FuseSentinel);
            }

            if (offset < 0)
            {
                return -1;
            }

            using (var stream = new FileStream(auxPath, FileMode.Open, FileAccess.ReadWrite, FileShare.Read))
            {
                stream.Position = offset;
                bool already = stream.ReadByte() == Stub[0] && stream.ReadByte() == Stub[1];
                if (already)
                {
                    return 0;
                }

                stream.Position = offset;
                stream.Write(Stub, 0, Stub.Length);
            }

            log?.Invoke("[ENHANCER] Auxiliary ASAR-fuse re-check neutralised.", ELogType.Info);
            return 1;
        }
    }
}
