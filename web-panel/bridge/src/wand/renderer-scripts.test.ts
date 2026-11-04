// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';

const bundled = buildSync({
    entryPoints: [resolve(import.meta.dirname, 'renderer-scripts.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
}).outputFiles[0].text;
const { buildRendererBootstrap, loadRendererScripts } = new Function(
    'module',
    'require',
    `${bundled};return module.exports;`,
)({ exports: {} }, createRequire(import.meta.url));

const tempRoots: string[] = [];

function scriptsRoot(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'wand-renderer-scripts-'));
    tempRoots.push(root);
    for (const [name, source] of Object.entries(files)) {
        writeFileSync(join(root, name), source);
    }

    return root;
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe('renderer script loader', () => {
    it('keeps the other scripts running when one does not compile', () => {
        const root = scriptsRoot({
            'a-first.js': 'globalThis.ranFirst = WandEnhancer.apiVersion;',
            'b-broken.js': 'const ok = 1;\nlet broken = ;\n',
            'c-last.js': 'if (globalThis.ranLast) return;\nglobalThis.ranLast = true;',
        });
        const logged: string[] = [];

        const scripts = loadRendererScripts(root, root, (_level: string, message: string) =>
            logged.push(message),
        );

        expect(scripts.map((script: { name: string }) => script.name)).toEqual([
            'a-first.js',
            'b-broken.js',
            'c-last.js',
        ]);
        expect(logged).toHaveLength(1);
        expect(logged[0]).toContain('b-broken.js:2');

        const warnings: string[] = [];
        const context = {
            console: {
                info: () => undefined,
                warn: (...args: unknown[]) => warnings.push(args.join(' ')),
            },
        } as Record<string, unknown>;
        runInNewContext(buildRendererBootstrap('http://127.0.0.1:3223', scripts), context);

        expect(context.ranFirst).toBe(1);
        expect(context.ranLast).toBe(true);
        expect(warnings.some((warning) => warning.includes('b-broken.js:2'))).toBe(true);
    });

    it('leaves compilable scripts untouched', () => {
        const source = 'WandEnhancer.log("hello");\n';
        const root = scriptsRoot({ 'only.js': source });
        const logged: string[] = [];

        const scripts = loadRendererScripts(root, root, (_level: string, message: string) =>
            logged.push(message),
        );

        expect(scripts).toEqual([{ name: 'only.js', source }]);
        expect(logged).toEqual([]);
    });
});
