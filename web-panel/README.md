# Wand Web Panel

High-performance, lightweight, mobile-friendly remote web panel for Wand and WeMod.

## Architecture

- **Frontend:** Preact with Preact Signals, Tailwind CSS, Lingui.js for internationalization.
- **Bridge:** Standalone Electron bridge (`bridge.cjs`) interfacing with Wand's renderer store and IPC channels.
- **Protocol:** Strict WebSocket messaging (`protocol/messages.ts` and `protocol/web-contract.json`) with ephemeral pairing tokens.
- **Offline & PWA:** Standalone Progressive Web App support with tactile touch haptics (`navigator.vibrate`) and zero external CDN requirements.

## Key Features

- **Trainer Remote Control:** Real-time bi-directional cheat adjustments (Toggles, Sliders, Numbers, Steppers).
- **Round-Trip Latency Tracking:** Measures write acknowledgment delay in milliseconds.
- **Game Library Navigation:** Browse and remotely launch installed games (`My Games`).
- **Pinned Cheats:** Pin high-priority cheats per game (`pinned-storage.ts`).
- **Cheat Presets:** Save, switch, and export/import cheat configurations as sanitized JSON (`preset-storage.ts`).
- **Multilingual Support:** Full English (`en-US`) and Arabic (`ar-SA`) localization with automatic RTL layout switching.
- **Security:** Authenticated WebSocket connection protected with ephemeral session tokens.

## Development & Build Commands

```bash
# Install dependencies
pnpm install

# Start Vite dev server
pnpm dev

# Start Vite dev server accessible on LAN (0.0.0.0)
pnpm dev:host

# Run full test suite (60 tests)
pnpm test

# Run type-checks (Web + Bridge)
pnpm typecheck

# Extract and compile translation strings
pnpm i18n:extract
pnpm i18n:compile

# Build production bundle (Vite + Bridge + Script minification)
pnpm build
```

## Production Distribution

The production bundle is generated into `web-panel/dist/` and embedded directly into the standalone `WandEnhancer.exe` executable:
- `dist/index.html` and assets (Preact single-page application)
- `dist/bridge.cjs` (bundled Electron bridge)
- `dist/renderer-scripts/` (injected renderer sync scripts)

