#!/usr/bin/env node
// Enforces the dist invariants AGENTS.md previously only stated in prose:
// the bundles must parse, and no dev-only payload may ship to users.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const REQUIRED_FILES = [
    'bridge.cjs',
    'index.html',
    path.join('renderer-scripts', 'remote-popup-cleanup.js'),
];

const FORBIDDEN_SUBSTRINGS = [
    'mock-instance',
    'Mock Adventure',
    'Debug session',
    'mock=1',
    'demo-session',
    'vite.svg',
    'tailwind-merge',
    'class-variance-authority',
];

const failures = [];

if (!fs.existsSync(distDir)) {
    fail(`dist/ not found at ${distDir} - run the build first`);
}

for (const relative of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(distDir, relative))) {
        failures.push(`missing required artifact: ${relative}`);
    }
}

for (const file of collectFiles(distDir)) {
    const relative = path.relative(distDir, file);

    if (file.endsWith('.js') || file.endsWith('.cjs')) {
        try {
            execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
        } catch (error) {
            failures.push(`syntax error in ${relative}: ${firstLine(error)}`);
        }
    }

    if (!isTextArtifact(file)) {
        continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    for (const needle of FORBIDDEN_SUBSTRINGS) {
        if (content.includes(needle)) {
            failures.push(`dev-only payload "${needle}" found in ${relative}`);
        }
    }
}

if (failures.length > 0) {
    fail(`dist verification failed:\n  - ${failures.join('\n  - ')}`);
}

console.log('dist verified: bundles parse, no dev-only payload.');

function collectFiles(dir) {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            found.push(...collectFiles(full));
        } else if (entry.isFile()) {
            found.push(full);
        }
    }
    return found;
}

function isTextArtifact(file) {
    return ['.js', '.cjs', '.mjs', '.css', '.html', '.json'].includes(path.extname(file));
}

function firstLine(error) {
    const output = String(error.stderr || error.message || '');
    return output.split('\n').find((line) => line.trim().length > 0) ?? 'unknown error';
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
