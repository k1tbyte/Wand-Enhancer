---
paths:
  - 'scripts/**'
  - 'build.ps1'
  - 'web-panel/**/*.test.ts'
  - 'web-panel/**/*.test.tsx'
---

# Testing

- Tests use temporary fixtures, never a real Wand installation. Do not run mutation experiments against the live install.
- Desktop state and interop regressions go in `scripts/test-desktop.ps1`. Write a regression test with every fix and check that it fails without the fix.
- `scripts/test-patch-locators.ps1 -AssemblyPath .\WandEnhancer\bin\Release\WandEnhancer.exe -BundleDirectory <extracted original bundle>` applies patches to temporary copies and runs `node --check`. Its default synthetic fixtures cover prettified and reminified identifiers separately.
- `scripts/test-auxiliary-integrity.ps1` works on copied auxiliary service files only.
- Never commit proprietary extracted bundles. `.source` and `.sources` are for reverse-engineering sessions and stay out of git.
- Web tests run in Vitest with jsdom and sit next to the module they cover. `pnpm test` builds the bridge first.
- `web-panel/scripts/docs-refs.test.ts` fails when a rule in `.claude/rules/` names a path that no longer exists, or its `paths` match no file. Rename the reference together with the file.
- Manual pre-release checks are listed in CONTRIBUTING.md.
