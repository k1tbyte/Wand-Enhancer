using System;
using System.Collections.Generic;
using System.IO;

namespace WandEnhancer.Core.Patching.Strategies.Static
{
    /// <summary>
    /// Handles auxiliary signature, archive and Electron fuse checks for modified clients.
    /// </summary>
    internal static class AuxTrustNeutralizer
    {
        private const string ImportName = "WinVerifyTrust";
        private static readonly byte[] Stub = { 0x16, 0x2A }; // ldc.i4.0; ret

        /// <returns>Methods stubbed, or -1 on failure.</returns>
        public static int Neutralize(string auxPath, Action<string, ELogType> log)
        {
            IReadOnlyList<long> offsets;
            List<DotNetImage.ValidationBody> clientBodies;
            int archiveCount;
            int fuseCount;
            using (DotNetImage image = DotNetImage.Load(auxPath))
            {
                if (image == null)
                {
                    log?.Invoke($"[ENHANCER] {Path.GetFileName(auxPath)} is not a managed image; leaving it alone.", ELogType.Warn);
                    return -1;
                }

                offsets = image.FindPInvokeCallerCodeOffsets(ImportName);
                clientBodies = new List<DotNetImage.ValidationBody>(image.FindAsarValidationBodyOffsets());
                archiveCount = clientBodies.Count;
                clientBodies.AddRange(image.FindFuseValidationBodyOffsets());
                fuseCount = clientBodies.Count - archiveCount;
            }

            if (offsets.Count == 0)
            {
                log?.Invoke($"[ENHANCER] No {ImportName} caller found in {Path.GetFileName(auxPath)}; the aux may have changed.", ELogType.Warn);
                return -1;
            }

            int stubbed = 0;
            using (var stream = new FileStream(auxPath, FileMode.Open, FileAccess.ReadWrite, FileShare.Read))
            {
                foreach (long offset in offsets)
                {
                    stream.Position = offset;
                    bool already = stream.ReadByte() == Stub[0] && stream.ReadByte() == Stub[1];
                    if (already)
                    {
                        continue;
                    }

                    stream.Position = offset;
                    stream.Write(Stub, 0, Stub.Length);
                    stubbed++;
                }
                foreach (var body in clientBodies)
                {
                    long headerOffset = body.HeaderOffset;
                    stream.Position = headerOffset;
                    int flags = stream.ReadByte();
                    bool fat = (flags & 3) == 3;
                    int headerSize = fat ? (stream.ReadByte() >> 4) * 4 : 1;
                    long codeOffset = headerOffset + headerSize;
                    stream.Position = codeOffset;
                    bool already = stream.ReadByte() == Stub[0] && stream.ReadByte() == Stub[1];
                    bool hasSections = fat && (flags & 8) != 0;
                    if (already && !hasSections) continue;
                    // A ret inside the original try region is invalid IL. Detach
                    // the now-unreachable EH sections, preserving offsets/anchors.
                    if (hasSections)
                    {
                        stream.Position = headerOffset;
                        stream.WriteByte((byte)(flags & ~8));
                    }
                    stream.Position = codeOffset;
                    var replacement = new byte[body.StubSize];
                    Array.Copy(Stub, replacement, Stub.Length);
                    stream.Write(replacement, 0, replacement.Length);
                    stubbed++;
                }
            }

            log?.Invoke($"[ENHANCER] Auxiliary compatibility applied ({offsets.Count} signature, {archiveCount} ASAR, {fuseCount} fuse check(s), {stubbed} changed).", ELogType.Info);
            return stubbed;
        }
    }
}
