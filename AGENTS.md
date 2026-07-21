# AGENTS

## Cursor Cloud specific instructions

Physical Media Launcher is a **Decky Loader plugin for the Steam Deck**: a TypeScript/React
frontend panel plus a Python backend. It has two independently testable parts.

### Frontend (TypeScript/React)
- Package manager is **pnpm** (see `pnpm-lock.yaml`); Node 22 + pnpm 10 are available.
- Build/verify with `pnpm run build` (rollup via `@decky/rollup`). There is **no separate lint
  script** — a clean `pnpm run build` is the canonical type/compile check.
- `dist/index.js` is intentionally committed (see `.gitignore`) so the plugin can be dropped into
  Decky without a local build; `pnpm run build` regenerates it deterministically.
- Do not rely on `npx tsc --noEmit`: it reports a spurious `Cannot find module 'react-router'`
  error originating from the bundled types of the `@decky/api` dependency, not from repo code.
  Use `pnpm run build` for validation instead.

### Backend (Python)
- Pure Python **standard library only** — there is no `requirements.txt`/virtualenv to set up.
- Run tests with `python3 -m unittest discover -s tests -v` (also exposed as `pnpm test`).

### Running the app end-to-end
- The **full plugin UI cannot run in this VM**: it needs a real Steam Deck with Decky Loader and
  Steam Game Mode (`decky.pyi` is only a stub; `import decky` is provided by Decky at runtime, so
  `main.py` is not directly runnable here). Do not attempt to launch it as a dev server.
- To exercise core functionality without hardware, drive the backend modules directly
  (`backend.game_info`, `backend.transfer`, `backend.shortcuts`) against a temp directory that
  mimics an inserted SD card containing `game_info.json` — this covers detect → copy-to-SSD →
  Non-Steam `shortcuts.vdf` injection, which is the plugin's core pipeline.
