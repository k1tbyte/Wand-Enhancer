using System;

namespace WeModPatcher.Models
{
    public sealed class Signature
    {
        public readonly byte[] OriginalBytes;
        public readonly byte[] PatchBytes;
        public readonly byte[] Sequence;
        public readonly byte[] Mask;
        public readonly int Offset;

        public int Length => Sequence.Length;

        public static implicit operator byte[](Signature signature) => signature.Sequence;

        public Signature(string signature, int offset, byte[] patchBytes, byte[] originalBytes)
        {
            Parse(signature, out Sequence, out Mask);
            PatchBytes = patchBytes;
            OriginalBytes = originalBytes;
            Offset = offset;
        }

        private static void Parse(string signatureStr, out byte[] pattern, out byte[] mask)
        {
            var parts = signatureStr.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            var length = parts.Length;

            pattern = new byte[length];
            mask = new byte[length];

            for (var i = 0; i < length; i++)
            {
                if (parts[i] == "??" || parts[i] == "?")
                {
                    pattern[i] = 0;
                    // wildcard byte
                    mask[i] = 0;
                    continue;
                }

                pattern[i] = Convert.ToByte(parts[i], 16);
                mask[i] = 1;
            }
        }
    }
}
