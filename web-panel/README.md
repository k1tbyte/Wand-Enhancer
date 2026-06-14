# Wand Web Panel

Local mobile-friendly web panel for Wand.

## Commands

```bash
pnpm install
pnpm dev
pnpm bridge:demo
```

Hosted access on the local machine:

- `http://localhost:4173/`

Hosted access on the LAN:

```bash
pnpm run dev:host
```

Then open the machine IP on port `4173`.

Use `?ws=ws://host:port/remote/ws` to override the bridge URL. The fixture bridge is dev-only;
production is bundled to `dist/bridge.cjs`.
