# Wand Web Panel

Local mobile-friendly web panel scaffold for Wand.

## Commands

```bash
npm install
npm run dev
```

Hosted access on the local machine:

- `http://localhost:4173/?mock=1`

Hosted access on the LAN:

```bash
npm run dev:host
```

Then open the machine IP on port `4173`.

## Modes

- `?mock=1`
  - dev server only; loads the demo trainer and values through a debug-only import
- `?ws=ws://host:port/remote/ws`
  - connects to a real bridge once the desktop layer exists

Production builds exclude the debug route and demo JSON from the shipped bundle.