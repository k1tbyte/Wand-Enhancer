using System;
using System.IO;
using System.Text;
using WandEnhancer.Core.Patching.Shared;

namespace WandEnhancer.Core.Patching.Strategies.Static
{
    /// <summary>
    /// Rewrites the SHA256 embedded in Wand.exe's <c>ElectronAsar\Integrity</c> PE resource so it
    /// matches the patched app.asar. Wand bakes the original archive's header hash into this
    /// resource at build time; once a patch edits app.asar's content, that embedded value is
    /// stale. Electron's own runtime fuse check is disabled by <see cref="DiskFusePatch"/> and
    /// never reads it, but WandAuxiliaryService.exe independently re-validates app.asar against
    /// this same resource and refuses to cooperate on a mismatch ("client_integrity_failed").
    /// The resource holds small UTF8 JSON (e.g. <c>[{"file":"resources\app.asar","alg":"SHA256",
    /// "value":"&lt;64 hex&gt;"}]</c>); only the 64 hex characters are rewritten in place, so the
    /// resource's size and the rest of the PE never change.
    /// </summary>
    internal static class AsarIntegrityResourcePatch
    {
        // Matches the raw UTF8 bytes of the resource verbatim, backslash escaped as JSON does it.
        private const string AnchorPrefix = "\"file\":\"resources\\\\app.asar\",\"alg\":\"SHA256\",\"value\":\"";
        private const int HashHexLength = 64;
        private const int ChunkSize = 1 << 20;

        /// <returns>True if rewritten, false if the resource is absent from this build (skip, not a failure).</returns>
        public static bool Patch(string exePath, string asarPath, Action<string, ELogType> log)
        {
            string newHash = AsarHeaderHash.Compute(asarPath);
            if (newHash.Length != HashHexLength)
            {
                throw new Exception("Computed asar header hash is not 64 hex characters; cannot patch the integrity resource safely.");
            }

            byte[] anchor = Encoding.UTF8.GetBytes(AnchorPrefix);
            long hashOffset = FindSoleHashOffset(exePath, anchor);
            if (hashOffset < 0)
            {
                return false;
            }

            using (var stream = new FileStream(exePath, FileMode.Open, FileAccess.ReadWrite, FileShare.Read))
            {
                byte[] existing = new byte[HashHexLength];
                stream.Position = hashOffset;
                ReadFull(stream, existing, 0, existing.Length);
                if (!IsLowercaseHex(existing))
                {
                    throw new Exception("The ASAR integrity resource's value is not a 64-character hex string; the resource may have changed.");
                }

                string existingHash = Encoding.ASCII.GetString(existing);
                if (string.Equals(existingHash, newHash, StringComparison.Ordinal))
                {
                    return true; // Already correct (e.g. a no-op re-patch).
                }

                stream.Position = hashOffset;
                stream.Write(Encoding.ASCII.GetBytes(newHash), 0, HashHexLength);
            }

            log?.Invoke("[ENHANCER] Rewrote the ASAR integrity resource hash in Wand.exe to match the patched app.asar.", ELogType.Info);
            return true;
        }

        /// <summary>File offset of the hash immediately following the sole anchor match, or -1 if absent.</summary>
        private static long FindSoleHashOffset(string exePath, byte[] anchor)
        {
            long found = -1;
            using (var stream = new FileStream(exePath, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                var buffer = new byte[ChunkSize + anchor.Length + HashHexLength];
                long bufferStart = 0;
                int filled = 0;

                while (true)
                {
                    filled += ReadSome(stream, buffer, filled, buffer.Length - filled);
                    int limit = filled - anchor.Length - HashHexLength;

                    for (int i = 0; i <= limit; i++)
                    {
                        if (!Matches(buffer, i, anchor))
                        {
                            continue;
                        }

                        if (found >= 0)
                        {
                            throw new Exception("More than one ASAR integrity resource match in Wand.exe; cannot tell which is the real one.");
                        }

                        found = bufferStart + i + anchor.Length;
                    }

                    bool atEof = filled < buffer.Length;
                    if (atEof)
                    {
                        break;
                    }

                    int keep = anchor.Length + HashHexLength - 1;
                    Buffer.BlockCopy(buffer, filled - keep, buffer, 0, keep);
                    bufferStart += filled - keep;
                    filled = keep;
                }
            }

            return found;
        }

        private static bool Matches(byte[] buffer, int offset, byte[] pattern)
        {
            for (int i = 0; i < pattern.Length; i++)
            {
                if (buffer[offset + i] != pattern[i])
                {
                    return false;
                }
            }

            return true;
        }

        private static bool IsLowercaseHex(byte[] bytes)
        {
            foreach (byte b in bytes)
            {
                bool isDigit = b >= '0' && b <= '9';
                bool isLower = b >= 'a' && b <= 'f';
                if (!isDigit && !isLower)
                {
                    return false;
                }
            }

            return true;
        }

        private static int ReadSome(Stream stream, byte[] buffer, int offset, int count)
        {
            int total = 0;
            while (total < count)
            {
                int read = stream.Read(buffer, offset + total, count - total);
                if (read == 0)
                {
                    break;
                }

                total += read;
            }

            return total;
        }

        private static void ReadFull(Stream stream, byte[] buffer, int offset, int count)
        {
            while (count > 0)
            {
                int read = stream.Read(buffer, offset, count);
                if (read == 0)
                {
                    throw new EndOfStreamException();
                }

                offset += read;
                count -= read;
            }
        }
    }
}
