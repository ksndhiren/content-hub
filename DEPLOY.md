# Deploying Content Hub to Cloudflare Pages

Auto-deploy from git. No CLI tokens. ~10 minutes end-to-end.

## One-time setup

### 1. Cloudflare account
- Sign up free at <https://dash.cloudflare.com>.

### 2. Create the R2 bucket
- Dashboard → **R2** → **Create bucket**
- Name: `content-hub-data`
- Repeat for the preview bucket: `content-hub-data-preview` (used by branch / PR deploys so they don't write into prod data).

### 3. Connect the GitHub repo
- Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
- Authorize the Cloudflare GitHub App on the `content-hub` repo (one click).
- Pick the `main` branch as production.

### 4. Build settings
Cloudflare auto-detects most of this from `vite.config.ts` + `wrangler.toml`, but confirm:
- **Framework preset**: `None` (Nitro handles it via Vite — don't pick a framework preset, it'll override our config).
- **Build command**: `bun run build` (or `npm run build` if Bun isn't on the build image).
- **Build output directory**: `.output/public`
- **Root directory**: leave empty.
- **Node version**: 20 (set via env var `NODE_VERSION = 20` if needed).

### 5. Bind R2 to the project
- Project → **Settings** → **Functions** → **R2 bucket bindings** → **Add binding**.
- Variable name: `DATA`
- Bucket: `content-hub-data` (and `content-hub-data-preview` under "Preview").

`wrangler.toml` already declares this — the dashboard config just mirrors it.

### 6. Secrets
- Project → **Settings** → **Environment variables** → **Production**:
  - `OPENAI_API_KEY` → your key (mark as Encrypted).
  - Optional overrides: `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `OPENAI_CHAT_MODEL`.
- Repeat for **Preview** so branch deploys also work.

### 7. Deploy
Push to `main`. Cloudflare runs the build, ships to a `*.pages.dev` URL. Done.

## What the runtime looks like

- Plans → `R2: plans/<brand>-<week>.json`
- Graphics → `R2: graphics/<brand>/<week>/<postId>_<slideIndex>.json` (each ~1 MB)
- Competitor scans → `R2: plans/<brand>-<week>.competitors.json`
- Brand competitor lists → `R2: brands/<brand>.competitors.json`

Free-tier headroom: 10 GB storage, 1M writes/month, 10M reads/month, unlimited egress. For 3 brands × weekly cadence this is months of runway.

## Local dev still works

`bun dev` (or `npm run dev`) runs the same code with the R2 binding undefined → `storage.server.ts` falls back to the local `./data/` folder. Same API both sides, no env-detection branching in app code.

## Troubleshooting

**"Module externalized for browser compatibility"**
Some `.server.ts` import is being pulled into the client bundle. Check that the file ends in `.server.ts` (TanStack Start uses that suffix to mark server-only).

**"R2 binding undefined" in production**
You skipped step 5. Recheck Pages → Settings → Functions → R2 bindings.

**Cold start latency**
First request after a deploy can be ~1-2s. Subsequent requests are warm and fast. This is normal for Workers.

**Preview deploys don't see prod data**
By design — they bind to `content-hub-data-preview` so PRs don't mutate prod. If you actively want PR previews to read prod, swap the preview binding in the dashboard.

## Why Pages (not Workers) for this app

- Built-in GitHub auto-deploy with PR previews.
- Polished build pipeline (no `wrangler deploy` step).
- Same R2/D1/KV bindings as Workers.
- Free tier is generous for 3-4 internal users.

Pick Workers later if you need Durable Objects, Cron Triggers, queues, or websockets.
