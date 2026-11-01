// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILE_REF = /\.(?:cs|csproj|ts|tsx|js|cjs|mjs|json|md|ps1|yml)$|\/$/;
const REPO_DIR = /^(?:WandEnhancer|AsarSharp|web-panel|scripts|docs|\.claude|\.github)\//;
const NOT_A_PATH = /^[@#/]|^https?:|[<>*{}()=|]|\.\.\./;
// Build output: named by the rules, absent from git.
const GENERATED = /^web-panel\/dist(?:\/|$)/;

// Untracked files count, so a rule and the file it names can land before `git add`.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
})
    .split('\n')
    .filter((file) => file !== '' && existsSync(`${ROOT}${file}`));

// Rules shorten paths (`Core/Js/JsCursor.cs`), so a reference holds when any path contains it.
const known = new Set<string>();
for (const file of files) {
    const parts = file.split('/');
    for (let from = 0; from < parts.length; from++) {
        for (let to = from + 1; to <= parts.length; to++) {
            known.add(parts.slice(from, to).join('/'));
        }
    }
}

const RULES = globSync('.claude/rules/*.md', { cwd: ROOT }).map((file) =>
    file.replaceAll('\\', '/'),
);
const DOCS = ['CLAUDE.md', ...RULES];

const read = (file: string) => readFileSync(`${ROOT}${file}`, 'utf8').replaceAll('\r\n', '\n');

function refs(src: string): string[] {
    return [...src.matchAll(/`([^`\s]+)`/g)]
        .map((match) => (match[1] ?? '').replace(/[,.:;]+$/, ''))
        .filter(
            (token) =>
                !NOT_A_PATH.test(token) &&
                (token.includes('/') || token.endsWith('.md')) &&
                (FILE_REF.test(token) || REPO_DIR.test(token)),
        )
        .map((token) => token.replace(/\/$/, ''))
        .filter((token) => !GENERATED.test(token));
}

function pathGlobs(src: string): string[] {
    const front = /^---\n([\s\S]*?)\n---/.exec(src)?.[1] ?? '';
    return [...front.matchAll(/^\s+-\s+'([^']+)'/gm)].map((match) => match[1] ?? '');
}

describe('agent docs', () => {
    test('there are rules to check', () => {
        expect(RULES.length).toBeGreaterThan(0);
    });

    test.each(DOCS)('%s names files that exist', (doc) => {
        expect(refs(read(doc)).filter((ref) => !known.has(ref))).toEqual([]);
    });

    test.each(RULES)('%s loads on files that exist', (rule) => {
        const globs = pathGlobs(read(rule));
        expect(globs, 'a rule without paths is never loaded').not.toEqual([]);
        expect(globs.filter((glob) => !files.some((file) => matchesGlob(file, glob)))).toEqual([]);
    });
});
