using System;
using System.Collections.Generic;
using System.IO;

namespace WandEnhancer.Core.Patching.Strategies.Static
{
    /// <summary>
    /// Rewrites WinVerifyTrust callers to return S_OK (`ldc.i4.0; ret`).
    /// </summary>
    internal static class AuxTrustNeutralizer
    {
        private const string ImportName = "WinVerifyTrust";
        private static readonly byte[] Stub = { 0x16, 0x2A }; // ldc.i4.0; ret

        /// <returns>Methods stubbed, or -1 on failure.</returns>
        public static int Neutralize(string auxPath, Action<string, ELogType> log)
        {
            IReadOnlyList<long> offsets;
            using (DotNetImage image = DotNetImage.Load(auxPath))
            {
                if (image == null)
                {
                    log?.Invoke($"[ENHANCER] {Path.GetFileName(auxPath)} is not a managed image; leaving it alone.", ELogType.Warn);
                    return -1;
                }

                offsets = image.FindPInvokeCallerCodeOffsets(ImportName);
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
            }

            log?.Invoke($"[ENHANCER] Auxiliary trust check neutralised ({stubbed} method(s)).", ELogType.Info);
            return stubbed;
        }
    }
}
