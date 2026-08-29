using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace WandEnhancer.Core.Js
{
    /// <summary>
    /// Navigates minified JavaScript by matching delimiters rather than by matching shape.
    /// Wand renames identifiers on every build but never renames its API endpoints, IPC
    /// channel names or public method names, so anchoring on those and walking the
    /// delimiter structure keeps a patch valid across builds.
    /// </summary>
    internal sealed class JsCursor
    {
        private const string RegexPrecedingChars = "(,=:[!&|?{};+-*%~^<>";
        private const int NameLookbackChars = 128;
        private static readonly Regex NameBeforeParen = new Regex(@"[#\w$]+$");
        private static readonly Regex FunctionKeyword = new Regex(@"(?<![\w$.])function\s*\*?\s*[\w$]*\s*\(");
        private static readonly HashSet<string> BlockKeywords =
            new HashSet<string>(StringComparer.Ordinal) { "if", "for", "while", "switch", "catch", "with", "do", "else" };

        // A slash after one of these is a regex literal, not division. Minifiers emit
        // `return/re/.test(x)` with no space, so missing these desyncs the whole scan.
        private static readonly HashSet<string> RegexPrecedingKeywords =
            new HashSet<string>(StringComparer.Ordinal)
            {
                "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
                "throw", "case", "do", "else", "yield", "await"
            };

        private readonly string _text;

        public JsCursor(string text)
        {
            _text = text;
        }

        public string Text => _text;

        public int IndexOf(string value, int from = 0)
        {
            return from >= _text.Length ? -1 : _text.IndexOf(value, from, StringComparison.Ordinal);
        }

        /// <summary>Index of the delimiter closing the one at <paramref name="openIndex"/>, or -1.</summary>
        public int MatchClose(int openIndex)
        {
            char open = _text[openIndex];
            char close = CloserOf(open);
            int depth = 0;

            for (int index = openIndex; index < _text.Length;)
            {
                char current = _text[index];
                if (current == open)
                {
                    depth++;
                    index++;
                }
                else if (current == close)
                {
                    if (--depth == 0)
                    {
                        return index;
                    }

                    index++;
                }
                else
                {
                    index = SkipToken(index);
                }
            }

            return -1;
        }

        /// <summary>Open delimiters enclosing <paramref name="index"/>, innermost first.</summary>
        public List<int> OpenerStack(int index)
        {
            var stack = new List<int>();
            for (int cursor = 0; cursor < index && cursor < _text.Length;)
            {
                char current = _text[cursor];
                if (current == '{' || current == '(' || current == '[')
                {
                    stack.Add(cursor);
                    cursor++;
                }
                else if (current == '}' || current == ')' || current == ']')
                {
                    if (stack.Count > 0)
                    {
                        stack.RemoveAt(stack.Count - 1);
                    }

                    cursor++;
                }
                else
                {
                    cursor = SkipToken(cursor);
                }
            }

            stack.Reverse();
            return stack;
        }

        /// <summary>Innermost enclosing delimiter of the given kind, or -1.</summary>
        public int EnclosingOpener(int index, char kind)
        {
            foreach (int opener in OpenerStack(index))
            {
                if (_text[opener] == kind)
                {
                    return opener;
                }
            }

            return -1;
        }

        /// <summary>Innermost named function or method whose body contains <paramref name="index"/>.</summary>
        public JsFunction EnclosingFunction(int index)
        {
            foreach (int opener in OpenerStack(index))
            {
                if (_text[opener] != '{')
                {
                    continue;
                }

                var function = ReadFunctionAt(opener);
                if (function != null)
                {
                    return function;
                }
            }

            return null;
        }

        /// <summary>The named function whose body closes at <paramref name="closeIndex"/>, or null.</summary>
        public JsFunction FunctionEndingAt(int closeIndex)
        {
            if (closeIndex < 0 || closeIndex >= _text.Length || _text[closeIndex] != '}')
            {
                return null;
            }

            var stack = OpenerStack(closeIndex);
            return stack.Count == 0 ? null : ReadFunctionAt(stack[0]);
        }

        /// <summary>First function declared as <c>name(...)</c>, ignoring property and call sites.</summary>
        public JsFunction FindFunction(string name)
        {
            var pattern = new Regex($@"(?<![#\w$.]){Regex.Escape(name)}\s*\(");
            for (var match = pattern.Match(_text); match.Success; match = match.NextMatch())
            {
                int closeParen = MatchClose(match.Index + match.Length - 1);
                if (closeParen < 0)
                {
                    continue;
                }

                int bodyOpen = SkipWhitespaceForward(closeParen + 1);
                if (bodyOpen < _text.Length && _text[bodyOpen] == '{')
                {
                    var function = ReadFunctionAt(bodyOpen);
                    if (function != null && function.Name == name)
                    {
                        return function;
                    }
                }
            }

            return null;
        }

        /// <summary>First <c>function name(...) { }</c> declared at or after <paramref name="index"/>.</summary>
        public JsFunction FindFunctionAfter(int index)
        {
            var match = FunctionKeyword.Match(_text, index);
            if (!match.Success)
            {
                return null;
            }

            int closeParen = MatchClose(match.Index + match.Length - 1);
            if (closeParen < 0)
            {
                return null;
            }

            int bodyOpen = SkipWhitespaceForward(closeParen + 1);
            return bodyOpen < _text.Length && _text[bodyOpen] == '{' ? ReadFunctionAt(bodyOpen) : null;
        }

        /// <summary>
        /// Index of the opening parenthesis of <c>callee(... "literal" ...)</c>, or -1. Wand reuses the
        /// same channel names for inbound listeners and outbound sends, so the callee disambiguates.
        /// </summary>
        public int FindCall(string callee, string literal)
        {
            for (int anchor = IndexOf(literal); anchor >= 0; anchor = IndexOf(literal, anchor + 1))
            {
                int open = EnclosingOpener(anchor, '(');
                if (open >= 0 && NameBefore(open) == callee)
                {
                    return open;
                }
            }

            return -1;
        }

        /// <summary>Trailing identifier directly before <paramref name="index"/>, e.g. <c>send</c> of <c>a?.send(</c>.</summary>
        public string NameBefore(int index)
        {
            int end = SkipWhitespaceBack(index - 1) + 1;
            var match = MatchNameEndingAt(end);
            return match.Success ? match.Value.TrimStart('#') : null;
        }

        /// <summary>Identifier ending at <paramref name="end"/>, searched in a bounded window so
        /// multi-megabyte bundles are not copied on every lookup.</summary>
        private Match MatchNameEndingAt(int end)
        {
            int windowStart = Math.Max(0, end - NameLookbackChars);
            return NameBeforeParen.Match(_text.Substring(windowStart, end - windowStart));
        }

        public int SkipWhitespaceBack(int index)
        {
            while (index >= 0 && char.IsWhiteSpace(_text[index]))
            {
                index--;
            }

            return index;
        }

        public int SkipWhitespaceForward(int index)
        {
            while (index < _text.Length && char.IsWhiteSpace(_text[index]))
            {
                index++;
            }

            return index;
        }

        private JsFunction ReadFunctionAt(int bodyOpen)
        {
            int closeParen = SkipWhitespaceBack(bodyOpen - 1);
            if (closeParen < 0 || _text[closeParen] != ')')
            {
                return null;
            }

            var stack = OpenerStack(closeParen);
            if (stack.Count == 0 || _text[stack[0]] != '(')
            {
                return null;
            }

            int nameEnd = SkipWhitespaceBack(stack[0] - 1) + 1;
            var nameMatch = MatchNameEndingAt(nameEnd);
            if (!nameMatch.Success || BlockKeywords.Contains(nameMatch.Value))
            {
                return null;
            }

            int bodyClose = MatchClose(bodyOpen);
            return bodyClose < 0
                ? null
                : new JsFunction(nameMatch.Value, nameEnd - nameMatch.Length, bodyOpen, bodyClose, _text);
        }

        private int SkipToken(int index)
        {
            char current = _text[index];
            if (current == '"' || current == '\'' || current == '`')
            {
                return SkipString(index, current);
            }

            if (current != '/' || index + 1 >= _text.Length)
            {
                return index + 1;
            }

            char next = _text[index + 1];
            if (next == '/')
            {
                int lineEnd = _text.IndexOf('\n', index);
                return lineEnd < 0 ? _text.Length : lineEnd + 1;
            }

            if (next == '*')
            {
                int commentEnd = _text.IndexOf("*/", index + 2, StringComparison.Ordinal);
                return commentEnd < 0 ? _text.Length : commentEnd + 2;
            }

            return StartsRegexLiteral(index) ? SkipRegexLiteral(index) : index + 1;
        }

        private int SkipString(int index, char quote)
        {
            for (int cursor = index + 1; cursor < _text.Length; cursor++)
            {
                char current = _text[cursor];
                if (current == '\\')
                {
                    cursor++;
                }
                else if (current == quote)
                {
                    return cursor + 1;
                }
                else if (quote == '`' && current == '$' && cursor + 1 < _text.Length && _text[cursor + 1] == '{')
                {
                    int interpolationEnd = MatchClose(cursor + 1);
                    cursor = interpolationEnd < 0 ? _text.Length : interpolationEnd;
                }
            }

            return _text.Length;
        }

        private int SkipRegexLiteral(int index)
        {
            bool inCharacterClass = false;
            for (int cursor = index + 1; cursor < _text.Length; cursor++)
            {
                char current = _text[cursor];
                if (current == '\\')
                {
                    cursor++;
                }
                else if (current == '[')
                {
                    inCharacterClass = true;
                }
                else if (current == ']')
                {
                    inCharacterClass = false;
                }
                else if (current == '\n')
                {
                    return index + 1;
                }
                else if (current == '/' && !inCharacterClass)
                {
                    return cursor + 1;
                }
            }

            return _text.Length;
        }

        private bool StartsRegexLiteral(int index)
        {
            int previous = SkipWhitespaceBack(index - 1);
            if (previous < 0 || RegexPrecedingChars.IndexOf(_text[previous]) >= 0)
            {
                return true;
            }

            return IsIdentifierChar(_text[previous]) && RegexPrecedingKeywords.Contains(WordEndingAt(previous));
        }

        /// <summary>The identifier ending at <paramref name="end"/> inclusive, or "" when there is none.</summary>
        private string WordEndingAt(int end)
        {
            int start = end;
            while (start >= 0 && IsIdentifierChar(_text[start]))
            {
                start--;
            }

            // A preceding '.' makes it a member name (`x.in`), never a keyword.
            if (start >= 0 && _text[start] == '.')
            {
                return string.Empty;
            }

            return _text.Substring(start + 1, end - start);
        }

        private static bool IsIdentifierChar(char value)
        {
            return char.IsLetterOrDigit(value) || value == '_' || value == '$';
        }

        private static char CloserOf(char open)
        {
            switch (open)
            {
                case '{': return '}';
                case '(': return ')';
                case '[': return ']';
                default: throw new ArgumentException($"Not an opening delimiter: {open}", nameof(open));
            }
        }
    }
}
