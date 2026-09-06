using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;

namespace WandEnhancer.Core.Js
{
    /// <summary>
    /// Loads injected JavaScript from embedded <c>Patches/*.js</c> files.
    /// </summary>
    internal static class PatchPayload
    {
        private const string ResourcePrefix = "patches/";

        private static readonly ConcurrentDictionary<string, string> Cache =
            new ConcurrentDictionary<string, string>(StringComparer.Ordinal);

        private static readonly Regex Placeholder = new Regex(@"\$\{(?<name>\w+)\}");

        /// <summary>
        /// Loads a payload, substituting <c>${name}</c> placeholders in a single pass.
        /// Unknown placeholders are left intact.
        /// </summary>
        public static string Load(string name, params string[] placeholders)
        {
            if (placeholders.Length % 2 != 0)
            {
                throw new ArgumentException("Placeholders must be name/value pairs", nameof(placeholders));
            }

            var values = new Dictionary<string, string>(StringComparer.Ordinal);
            for (int index = 0; index < placeholders.Length; index += 2)
            {
                values[placeholders[index]] = placeholders[index + 1];
            }

            return Placeholder.Replace(
                Cache.GetOrAdd(name, ReadResource),
                match => values.TryGetValue(match.Groups["name"].Value, out var value) ? value : match.Value);
        }

        private static string ReadResource(string name)
        {
            string resourceName = $"{ResourcePrefix}{name}.js";
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName))
            {
                if (stream == null)
                {
                    throw new FileNotFoundException($"Embedded patch payload not found: {resourceName}");
                }

                using (var reader = new StreamReader(stream))
                {
                    return reader.ReadToEnd().Trim();
                }
            }
        }
    }
}
