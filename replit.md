# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/kick-and-snare` (`@workspace/kick-and-snare`)

Browser-based TR-808 drum sequencer v9.0 "DRUM EXPERIENCE" (React + Vite, port 24007).

**Key features (v9.0):**
- **808 synthesis**: All default sounds pre-rendered via `OfflineAudioContext` at startup. `_syn(id,t,v,d,octx,sh)` signature with optional 6-SHAPE params.
- **SHAPE system**: 6 SHAPE params (`sDec·sTune·sPunch·sSnap·sBody·sTone`) in `defFx()`. FX panel "Shape" section per instrument. On change → 280ms debounce → `engine.renderShape(id, fxObj)` re-renders + auto-plays preview.
- **Drum Kit system (v9)**: 8 named kits with real samples + synthesis fallback.
  - `DRUM_KITS` array: 808 Classic🔴, Trap⬡, Jazz Kit🎷, Lo-Fi📼, Electronic⚡, Acoustic🥁, Afrobeat🌍, Latin🔥
  - Real MP3 samples downloaded to `public/samples/{cr78,kit3,kit8}/{kick,snare,hihat}.mp3`
  - `engine.loadUrl(id, url)` fetches + decodes audio buffer from local URL
  - Jazz→Kit3, Lo-Fi→CR78, Acoustic→Kit8 samples; synthesis-only kits use dramatic shape multipliers
  - `applyKit()` loads samples async (with renderShape fallback on failure) + updates smpN labels
  - Kit selector UI: ◀ icon+name ▶ left of mascot
- **Sequencer Templates**: 15 multi-genre patterns (16/32 steps, humanized velocities)
- **Euclidean Sequencer**: 12 polyrhythm presets, blank-slate reset on template load
- **FX Rack**: 5 effects (filter, compressor, drive, delay, reverb) + 10 presets + drag-reorder
- **Looper**: hit drag for repositioning, quantize, auto-Q, retrospective capture
- **LIVE PADS**: ring buffer 4-bar capture, overdub, velocity sensitivity
- **Multi-view**: Sequencer, LIVE PADS, Euclid tabs
- **Ableton Link sync** via local WebSocket bridge (`link-bridge/bridge.js:9898`)
- **Web MIDI** input + MIDI learn
- **Song Arranger**, **Pattern Banks** (8 patterns)
- **WAV export** (OfflineAudioContext stereo, 1B/2B/4B selector)
- **URL share** (base64 + hex nibble steps)
- **PWA/TWA** manifest + service worker
- **Onboarding overlay** on first launch

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
