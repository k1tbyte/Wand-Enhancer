using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;

namespace WandEnhancer.Core.Patching.Strategies.Static
{
    internal sealed class DotNetImage : IDisposable
    {
        private readonly byte[] _bytes;
        private readonly PEReader _pe;
        private readonly MetadataReader _reader;

        private DotNetImage(byte[] bytes, PEReader pe, MetadataReader reader)
        {
            _bytes = bytes;
            _pe = pe;
            _reader = reader;
        }

        public static DotNetImage Load(string path)
        {
            byte[] bytes = File.ReadAllBytes(path);
            var pe = new PEReader(ImmutableArray.Create(bytes));
            try
            {
                if (!pe.HasMetadata)
                {
                    pe.Dispose();
                    return null;
                }

                return new DotNetImage(bytes, pe, pe.GetMetadataReader());
            }
            catch (BadImageFormatException)
            {
                pe.Dispose();
                return null;
            }
        }

        public void Dispose() => _pe.Dispose();

        /// File offset of the first IL byte of every method that calls the P/Invoke.
        public IReadOnlyList<long> FindPInvokeCallerCodeOffsets(string importName)
        {
            var hits = new List<long>();
            int token = FindMethodToken(importName);
            if (token == 0)
            {
                return hits;
            }

            foreach (MethodDefinitionHandle handle in _reader.MethodDefinitions)
            {
                int rva = _reader.GetMethodDefinition(handle).RelativeVirtualAddress;
                if (rva == 0)
                {
                    continue; // Abstract, P/Invoke, or otherwise bodyless.
                }

                try
                {
                    if (BodyCalls(_pe.GetMethodBody(rva).GetILBytes(), token))
                    {
                        hits.Add(IlFileOffset(rva));
                    }
                }
                catch (BadImageFormatException)
                {
                    // Malformed body: skip rather than trust a wrong offset.
                }
            }

            return hits;
        }

        private int FindMethodToken(string name)
        {
            foreach (MethodDefinitionHandle handle in _reader.MethodDefinitions)
            {
                if (_reader.GetString(_reader.GetMethodDefinition(handle).Name) == name)
                {
                    return MetadataTokens.GetToken(handle);
                }
            }

            return 0;
        }

        private long IlFileOffset(int rva)
        {
            SectionHeader section = _pe.PEHeaders.SectionHeaders[_pe.PEHeaders.GetContainingSectionIndex(rva)];
            int headerOffset = section.PointerToRawData + (rva - section.VirtualAddress);
            // IL follows the method body header: 12 bytes when fat, 1 when tiny.
            return headerOffset + ((_bytes[headerOffset] & 0x3) == 0x3 ? 12 : 1);
        }

        // Walks instruction boundaries so the token can't match operand data of another instruction.
        private static bool BodyCalls(byte[] il, int token)
        {
            int ip = 0;
            while (ip < il.Length)
            {
                byte op = il[ip];
                if (op == 0xFE)
                {
                    if (ip + 2 > il.Length) break;
                    ip += 2 + TwoByte[il[ip + 1]];
                }
                else if ((op == 0x28 || op == 0x6F) && ip + 5 <= il.Length && (int)ReadU32(il, ip + 1) == token)
                {
                    return true;
                }
                else if (op == 0x45) // switch: uint count then count 4-byte targets
                {
                    if (ip + 5 > il.Length) break;
                    long next = ip + 5L + (long)ReadU32(il, ip + 1) * 4;
                    if (next > il.Length) break; // Target table crosses the body.
                    ip = (int)next;
                }
                else
                {
                    ip += 1 + OneByte[op];
                }
            }

            return false;
        }

        private static uint ReadU32(byte[] b, int i) =>
            (uint)(b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24));

        #region IL operand sizes

        private static readonly int[] OneByte = BuildOneByteOperands();
        private static readonly int[] TwoByte = BuildTwoByteOperands();

        private static int[] BuildOneByteOperands()
        {
            var s = new int[256];
            foreach (int op in new[] { 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x1F })
            {
                s[op] = 1;
            }

            s[0x20] = 4; s[0x21] = 8; s[0x22] = 4; s[0x23] = 8;
            for (int op = 0x2B; op <= 0x37; op++) s[op] = 1; // short branches
            for (int op = 0x38; op <= 0x44; op++) s[op] = 4; // long branches
            s[0xDD] = 4; s[0xDE] = 1; // leave, leave.s
            foreach (int op in new[]
                     {
                         0x27, 0x28, 0x29, 0x6F, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x79, 0x7B, 0x7C,
                         0x7D, 0x7E, 0x7F, 0x80, 0x81, 0x8C, 0x8D, 0x8F, 0xA3, 0xA4, 0xA5, 0xC2, 0xC6, 0xD0
                     })
            {
                s[op] = 4; // metadata token operands
            }

            return s;
        }

        private static int[] BuildTwoByteOperands()
        {
            var s = new int[256];
            foreach (int op in new[] { 0x06, 0x07, 0x15, 0x16, 0x1C }) s[op] = 4; // ldftn..sizeof: tokens
            foreach (int op in new[] { 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E }) s[op] = 2; // ldarg..stloc: u2
            s[0x12] = 1; s[0x19] = 1; // unaligned., no.: prefixes with a 1-byte operand
            return s;
        }

        #endregion
    }
}
