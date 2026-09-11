// NOTE: Not wired into the build. Pro activation currently lives in the C# asar
// patch (EPatchType.ActivatePro). This renderer-side variant is kept for future
// use and is excluded from bridge/build.mjs (EXCLUDED_RENDERER_SCRIPTS), so it is
// neither bundled nor injected. To re-enable, remove it from that exclusion list.
import { installActivatePro } from './activate-pro/index.js';

installActivatePro(globalThis.WandEnhancer);
