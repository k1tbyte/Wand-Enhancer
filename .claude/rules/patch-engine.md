---
paths:
  - 'WandEnhancer/Core/Js/**'
  - 'WandEnhancer/Patches/*.js'
---

# Patch engine

- Patches are located structurally, not by shape. Anchor on something Wand does not rename between builds (an API endpoint, an IPC channel name, a public method name), then walk the delimiters with `Core/Js/JsCursor.cs` to the edit site. Identifiers that do change are read out of the located region, never baked into a pattern. A rebuild that only reminifies needs no change.
- No regex across a whole method body or bundle. Scope patterns to a located `JsFunction` via `Resolve`, so they run on a few hundred characters.
- A patch is one `PatchEntry`; its `Locate` delegate returns the edits. Return `null` when the anchor is absent: that means "not my file". Throw only when the anchor is present but the structure is unrecognisable: an unsupported build must fail loudly.
- Payload JS lives in `WandEnhancer/Patches/*.js`, embedded as `patches/<name>.js`, and is loaded with `PatchPayload.Load(name, "key", value, ...)`, which fills `${key}` placeholders in one pass. Never put payload JS in C# string literals.
- Edits from one patch apply highest offset first. Keep them non-overlapping.
- A patch that exists only on some builds sets `CapabilityHints`: an absent capability logs a skip, a detected but unpatchable one still fails the run.
- When Wand restructures something, add a fallback branch inside that patch's `Locate`, not a version table. The old branch keeps old builds working.
- Verify on real bundles, minified and prettified: locating must succeed on both and the patched files must pass `node --check`.
