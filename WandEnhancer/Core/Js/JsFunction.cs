using System;
using System.Text.RegularExpressions;

namespace WandEnhancer.Core.Js
{
    /// <summary>A named function or class method located in a bundle, addressed by delimiter position.</summary>
    internal sealed class JsFunction
    {
        private static readonly Regex ReturnKeyword = new Regex(@"(?<![\w$])return(?![\w$])");

        private readonly string _source;
        private JsCursor _body;

        public JsFunction(string name, int start, int bodyOpen, int bodyClose, string source)
        {
            Name = name;
            Start = start;
            BodyOpen = bodyOpen;
            BodyClose = bodyClose;
            _source = source;
        }

        public string Name { get; }
        public int Start { get; }
        public int BodyOpen { get; }
        public int BodyClose { get; }

        public string Body => _source.Substring(BodyOpen + 1, BodyClose - BodyOpen - 1);

        private JsCursor BodyCursor => _body ?? (_body = new JsCursor(Body));

        /// <summary>Captures a group from a pattern matched against this body only, not the whole bundle.</summary>
        public string Resolve(string pattern, string group)
        {
            var match = Regex.Match(Body, pattern, RegexOptions.Singleline);
            if (!match.Success || string.IsNullOrEmpty(match.Groups[group].Value))
            {
                throw new Exception($"Could not resolve '{group}' inside {Name}()");
            }

            return match.Groups[group].Value;
        }

        /// <summary>Rewrites the first match of a pattern scoped to this body; <c>${group}</c> back-references work.</summary>
        public JsEdit ReplaceInBody(string pattern, string replacement)
        {
            var match = Regex.Match(Body, pattern, RegexOptions.Singleline);
            if (!match.Success)
            {
                throw new Exception($"Pattern '{pattern}' not found inside {Name}()");
            }

            int start = BodyOpen + 1 + match.Index;
            return new JsEdit(start, start + match.Length, match.Result(replacement));
        }

        public JsEdit InsertAtStart(string code) => new JsEdit(BodyOpen + 1, BodyOpen + 1, code);

        public JsEdit InsertAtEnd(string code) => new JsEdit(BodyClose, BodyClose, code);

        public JsEdit ReplaceBody(string code) => new JsEdit(BodyOpen + 1, BodyClose, code);

        /// <summary>
        /// Rewrites the last top-level <c>return X</c> as <c>return WRAPPER</c>, where the wrapper's
        /// <c>$0</c> placeholder receives the original expression.
        /// </summary>
        public JsEdit WrapReturn(string wrapper)
        {
            var body = BodyCursor;
            int keywordEnd = -1;
            for (var match = ReturnKeyword.Match(body.Text); match.Success; match = match.NextMatch())
            {
                if (body.OpenerStack(match.Index).Count == 0)
                {
                    keywordEnd = match.Index + match.Length;
                }
            }

            if (keywordEnd < 0)
            {
                throw new Exception($"No top-level return statement in {Name}()");
            }

            int expressionStart = body.SkipWhitespaceForward(keywordEnd);
            int expressionEnd = FindStatementEnd(body, expressionStart);
            string expression = body.Text.Substring(expressionStart, expressionEnd - expressionStart);

            return new JsEdit(
                BodyOpen + 1 + expressionStart,
                BodyOpen + 1 + expressionEnd,
                wrapper.Replace("$0", $"({expression})"));
        }

        private static int FindStatementEnd(JsCursor body, int start)
        {
            for (int cursor = start; cursor < body.Text.Length; cursor++)
            {
                if (body.Text[cursor] == ';' && body.OpenerStack(cursor).Count == 0)
                {
                    return cursor;
                }
            }

            return body.Text.Length;
        }
    }

    /// <summary>A splice: replace <c>[Start, End)</c> of the bundle with <see cref="Text"/>.</summary>
    internal sealed class JsEdit
    {
        public JsEdit(int start, int end, string text)
        {
            Start = start;
            End = end;
            Text = text;
        }

        /// <summary>An insertion at <paramref name="at"/>, replacing nothing.</summary>
        public JsEdit(int at, string text) : this(at, at, text)
        {
        }

        public int Start { get; }
        public int End { get; }
        public string Text { get; }

        public string ApplyTo(string source) => source.Substring(0, Start) + Text + source.Substring(End);
    }
}
