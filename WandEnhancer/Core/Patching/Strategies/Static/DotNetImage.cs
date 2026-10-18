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

        /// <summary>Finds Wand's archive-status method by its path and hash algorithm, not obfuscated names.</summary>
        public sealed class ValidationBody
        {
            public long HeaderOffset { get; set; }
            public int StubSize { get; set; }
        }

        public IReadOnlyList<ValidationBody> FindAsarValidationBodyOffsets()
        {
            var hits = new List<ValidationBody>();
            bool hasAsarCapability = false;
            foreach (MethodDefinitionHandle handle in _reader.MethodDefinitions)
            {
                var method = _reader.GetMethodDefinition(handle);
                int rva = method.RelativeVirtualAddress;
                if (rva == 0) continue;
                var il = _pe.GetMethodBody(rva).GetILBytes();
                if (BodyContainsString(il, "ElectronAsar") && BodyContainsString(il, "Integrity")) hasAsarCapability = true;
                if (!BodyContainsString(il, @"resources\app.asar") || !BodyContainsString(il, "SHA256")) continue;

                // The located method must be static, take one string and return
                // Wand's Int32-backed status enum (zero is the valid status).
                if (!HasStatusSignature(method, false)) throw new InvalidDataException("Unrecognised auxiliary ASAR validation signature.");
                var body = GetValidationBody(rva, il);
                // Leave the remaining IL on instruction boundaries so the same
                // anchors remain readable on a second patch pass.
                var remaining = new byte[il.Length - body.StubSize];
                Array.Copy(il, body.StubSize, remaining, 0, remaining.Length);
                if (!BodyContainsString(remaining, @"resources\app.asar") || !BodyContainsString(remaining, "SHA256"))
                    throw new InvalidDataException("Auxiliary ASAR anchors overlap the return stub.");
                hits.Add(body);
            }
            if (hits.Count > 1) throw new InvalidDataException("Ambiguous auxiliary ASAR validation methods.");
            if (hasAsarCapability && hits.Count == 0) throw new InvalidDataException("Auxiliary ASAR validation detected but not recognised.");
            return hits;
        }

        /// <summary>Finds the status check calling Wand's anchored Electron fuse reader.</summary>
        public IReadOnlyList<ValidationBody> FindFuseValidationBodyOffsets()
        {
            int readerToken = 0;
            foreach (var handle in _reader.MethodDefinitions)
            {
                var method = _reader.GetMethodDefinition(handle);
                if (method.RelativeVirtualAddress == 0) continue;
                var il = _pe.GetMethodBody(method.RelativeVirtualAddress).GetILBytes();
                if (!BodyContainsString(il, "The Electron fuse sentinel was not found.")
                    || !BodyContainsString(il, "The Electron fuse wire is invalid.")) continue;
                if (readerToken != 0) throw new InvalidDataException("Ambiguous auxiliary Electron fuse readers.");
                readerToken = MetadataTokens.GetToken(handle);
            }
            var hits = new List<ValidationBody>();
            if (readerToken == 0) return hits; // Legacy auxiliary service.
            foreach (var handle in _reader.MethodDefinitions)
            {
                var method = _reader.GetMethodDefinition(handle);
                int rva = method.RelativeVirtualAddress;
                if (rva == 0) continue;
                var il = _pe.GetMethodBody(rva).GetILBytes();
                if (!BodyCalls(il, readerToken)) continue;
                if (!HasStatusSignature(method, true)) throw new InvalidDataException("Unrecognised auxiliary fuse validation signature.");
                var body = GetValidationBody(rva, il);
                var remaining = new byte[il.Length - body.StubSize];
                Array.Copy(il, body.StubSize, remaining, 0, remaining.Length);
                if (!BodyCalls(remaining, readerToken)) throw new InvalidDataException("Auxiliary fuse reader call overlaps the return stub.");
                hits.Add(body);
            }
            if (hits.Count != 1) throw new InvalidDataException("Auxiliary fuse validation detected but not recognised.");
            return hits;
        }

        private bool HasStatusSignature(MethodDefinition method, bool fuse)
        {
            var signature = _reader.GetBlobReader(method.Signature);
            if ((method.Attributes & System.Reflection.MethodAttributes.Static) == 0
                || signature.ReadByte() != 0 || signature.ReadCompressedInteger() != (fuse ? 3 : 1)
                || signature.ReadByte() != 0x11) return false;
            int type = signature.ReadCompressedInteger();
            if ((type & 3) != 0 || !IsInt32Enum(MetadataTokens.TypeDefinitionHandle(type >> 2))) return false;
            if (fuse)
            {
                if (signature.ReadByte() != 0x12) return false;
                int streamType = signature.ReadCompressedInteger();
                if ((streamType & 3) != 1) return false;
                var stream = _reader.GetTypeReference(MetadataTokens.TypeReferenceHandle(streamType >> 2));
                if (_reader.GetString(stream.Namespace) != "System.IO" || _reader.GetString(stream.Name) != "FileStream") return false;
            }
            if (signature.ReadByte() != 0x0E) return false;
            if (fuse && (signature.ReadByte() != 0x12 || (signature.ReadCompressedInteger() & 3) != 0)) return false;
            return signature.RemainingBytes == 0;
        }

        private ValidationBody GetValidationBody(int rva, byte[] il)
        {
            int stubSize = 0;
            while (stubSize < 2) stubSize = NextInstruction(il, stubSize);
            return new ValidationBody { HeaderOffset = MethodHeaderFileOffset(rva), StubSize = stubSize };
        }

        private bool IsInt32Enum(TypeDefinitionHandle handle)
        {
            var type = _reader.GetTypeDefinition(handle);
            if (type.BaseType.Kind != HandleKind.TypeReference) return false;
            var baseType = _reader.GetTypeReference((TypeReferenceHandle)type.BaseType);
            if (_reader.GetString(baseType.Namespace) != "System" || _reader.GetString(baseType.Name) != "Enum") return false;
            foreach (var fieldHandle in type.GetFields())
            {
                var field = _reader.GetFieldDefinition(fieldHandle);
                // Wand also obfuscates the enum's normally named value__ field.
                if ((field.Attributes & System.Reflection.FieldAttributes.Static) != 0) continue;
                var signature = _reader.GetBlobBytes(field.Signature);
                return signature.Length == 2 && signature[0] == 0x06 && signature[1] == 0x08;
            }
            return false;
        }

        private bool BodyContainsString(byte[] il, string value)
        {
            for (int ip = 0; ip < il.Length; ip = NextInstruction(il, ip))
            {
                if (il[ip] == 0x72 && ip + 5 <= il.Length)
                {
                    uint token = ReadU32(il, ip + 1);
                    if ((token >> 24) == 0x70 && _reader.GetUserString(MetadataTokens.UserStringHandle((int)(token & 0xFFFFFF))) == value)
                        return true;
                }
            }
            return false;
        }

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
            int headerOffset = MethodHeaderFileOffset(rva);
            int headerSize = (_bytes[headerOffset] & 0x3) == 0x3 ? (_bytes[headerOffset + 1] >> 4) * 4 : 1;
            return headerOffset + headerSize;
        }

        private int MethodHeaderFileOffset(int rva)
        {
            SectionHeader section = _pe.PEHeaders.SectionHeaders[_pe.PEHeaders.GetContainingSectionIndex(rva)];
            return section.PointerToRawData + (rva - section.VirtualAddress);
        }

        // Walks instruction boundaries so the token can't match operand data of another instruction.
        private static bool BodyCalls(byte[] il, int token)
        {
            for (int ip = 0; ip < il.Length; ip = NextInstruction(il, ip))
            {
                byte op = il[ip];
                if ((op == 0x28 || op == 0x6F) && ip + 5 <= il.Length && (int)ReadU32(il, ip + 1) == token)
                {
                    return true;
                }
            }

            return false;
        }

        private static int NextInstruction(byte[] il, int ip)
        {
            byte op = il[ip];
            if (op == 0xFE) return ip + 2 > il.Length ? il.Length : Math.Min(il.Length, ip + 2 + TwoByte[il[ip + 1]]);
            if (op != 0x45) return Math.Min(il.Length, ip + 1 + OneByte[op]);
            if (ip + 5 > il.Length) return il.Length;
            long next = ip + 5L + (long)ReadU32(il, ip + 1) * 4;
            return next > il.Length ? il.Length : (int)next;
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
