# Railway Deployment Runbook

This app deploys as a **single Railway service**: one Docker container that
serves both the Fastify API (on `/api/v1/*` and `/healthz`) and the built
React SPA (everything else) from the same origin.

Architecture:

```
                ┌──────────────────────────────────────────┐
   Browser  ──▶ │  Railway service: home-control-centre    │
                │  ───────────────────────────────────────  │
                │  Fastify (node:20)                        │
                │   ├─ /api/v1/*         → API routes       │
                │   ├─ /healthz          → healthcheck      │
                │   └─ /*                → SPA index.html   │
                └────────────┬─────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐    ┌──────────────────┐
                    │ Railway Postgres │   │ Railway Volume    │
                    │  (plugin)        │   │  mounted /app/    │
                    │                  │   │  uploads          │
                    └──────────────────┘   └──────────────────┘
```

---

## Prerequisites (one-time)

1. A [Railway](https://railway.app/) account.
2. The Railway CLI installed locally:

   ```bash
   npm i -g @railway/cli
   railway login
   ```

3. Your GitHub repo connected to Railway (recommended — auto-deploys on
   push to `main`).

---

## Step 1 — Update lockfile locally

The deploy added a new dependency (`@fastify/static`). Update the
lockfile and verify it builds before pushing:

```bash
pnpm install
pnpm build
```

Commit the changes:

```bash
git add .
git commit -m "chore: containerise for Railway deploy"
git push
```

---

## Step 2 — Create the Railway project

From the Railway dashboard:

1. **New Project → Deploy from GitHub repo** → pick this repo.
2. Railway detects the `Dockerfile` and `railway.json` automatically. The
   first build will run; let it finish (it will fail at runtime because
   env vars and the database aren't set up yet — that's expected).

Or from the CLI:

```bash
cd /path/to/repo
railway init       # creates a new project linked to this folder
railway up         # builds + deploys the current code
```

---

## Step 3 — Add the Postgres plugin

In the Railway dashboard, inside your project:

1. **+ New → Database → Add PostgreSQL**.
2. Railway provisions a managed Postgres and exposes a private
   `DATABASE_URL` variable.

Wire it into your service:

3. Open your service → **Variables** tab → **+ New Variable**.
4. Add `DATABASE_URL` with value `${{ Postgres.DATABASE_URL }}` (use the
   variable-reference syntax — type `${{` and Railway autocompletes).
   This uses the internal `postgres.railway.internal` host, which is
   private, fast, and doesn't need SSL.

---

## Step 4 — Add a persistent volume for file uploads

The app writes uploaded files to `./uploads`. To keep them across
deploys and restarts:

1. In your service → **Settings** tab → scroll to **Volumes**.
2. **+ New Volume**:
   - **Mount path:** `/app/uploads`
   - **Size:** start with 5 GB (resize later as needed)

That's it — the code already reads/writes that exact path because the
container's `WORKDIR` is `/app` and the upload code resolves
`process.cwd() + /uploads`.

> **Note:** A volume only attaches to a single replica. If you ever
> scale this service horizontally, migrate to S3/R2 first (the
> `@aws-sdk/client-s3` dep is already installed — only `routes/files.ts`
> needs to change).

---

## Step 5 — Set the remaining environment variables

In your service → **Variables**, add each of these. (Open
[.env.example](./.env.example) for the full list with comments.)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` *(set in step 3)* |
| `DATABASE_SSL` | `false` *(internal URL — leave false)* |
| `JWT_SECRET` | 48+ random chars — `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | A different 48+ random chars |
| `CORS_ORIGIN` | Your public Railway URL, e.g. `https://your-app.up.railway.app` |
| `STRIPE_SECRET_KEY` | `sk_live_…` from Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` *(set after step 7)* |
| `OPENAI_API_KEY` | `sk-…` |
| `LLM_MODEL` | e.g. `gpt-4o-mini` |
| `GOOGLE_MAPS_API_KEY` | from Google Cloud Console |
| `LINZ_BASEMAP_API_KEY` | from LINZ (if used) |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` or your own |

> **Tip:** Use `railway variables set FOO=bar` from the CLI as an
> alternative to clicking through the UI.

---

## Step 6 — Generate a public domain

1. Service → **Settings** → **Networking** → **Generate Domain**.
2. Railway creates `your-app.up.railway.app`. Update your `CORS_ORIGIN`
   variable to match this URL.
3. Optional: **Custom Domain** → add your own domain and follow the
   DNS-record instructions.

Trigger a redeploy after changing variables: **Deployments** → **⋯** →
**Redeploy**, or just push a new commit.

---

## Step 7 — Configure the Stripe webhook

Once your service has a public URL:

1. In Stripe dashboard: **Developers → Webhooks → + Add endpoint**.
2. Endpoint URL: `https://your-app.up.railway.app/api/v1/billing/webhook`
   (verify this path matches your `routes/billing.ts`).
3. Select the events your app handles (subscription/checkout events).
4. Copy the signing secret (`whsec_…`) → paste into Railway as
   `STRIPE_WEBHOOK_SECRET` → redeploy.

---

## Step 8 — Verify the deployment

```bash
curl -i https://your-app.up.railway.app/healthz
# → HTTP/2 200, body: {"status":"ok"}
```

Then open the URL in a browser and walk through:

- [ ] SPA loads (the React app renders)
- [ ] Sign-up / login works (cookies set, returning user persists)
- [ ] Upload a file → reload → file still there (volume is working)
- [ ] A Stripe test transaction triggers the webhook (check service logs)

Tail logs:

```bash
railway logs --service home-control-centre
```

---

## Operational notes

**Migrations.** The container runs `drizzle-kit migrate` on every
start. Drizzle migrations are idempotent — re-running them is safe.

**Rollback.** Deployments tab → pick a previous green deploy → **Redeploy**.

**Secret rotation.** Update the variable in Railway → it triggers a
new deploy automatically. For `JWT_SECRET` rotation, expect existing
sessions to be invalidated.

**Cost watch.** The volume + DB + service together run roughly
$5–15/month at idle, climbing with usage. Set a usage alert under
**Project → Settings → Usage**.

**Cold starts.** None — Railway containers stay warm. If you scale to
zero, the first request after idle will pay a ~5s cold-start cost.

**Scaling.** Single replica only while uploads live on the volume.
Before you scale `replicas > 1`, migrate uploads to S3/R2.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Build fails with `ERR_PNPM_OUTDATED_LOCKFILE` | You forgot Step 1 — run `pnpm install` locally and commit `pnpm-lock.yaml`. |
| Boot fails with `password authentication failed` | `DATABASE_URL` wasn't set to the `${{ Postgres.DATABASE_URL }}` reference. |
| Boot fails with `no pg_hba.conf entry, SSL off` | You're using the public PG URL — set `DATABASE_SSL=true`. |
| Upload works but file is missing after redeploy | Volume isn't mounted at `/app/uploads` — re-check Step 4. |
| SPA loads but every API call 404s | The SPA fallback is catching `/api/*` — confirm requests are going to `/api/v1/*` (check Network tab). |
| Stripe webhook returns 400 | `STRIPE_WEBHOOK_SECRET` mismatch — copy the secret from the *Webhook details* page, not from the events list. |

---

## Local Docker test (optional)

To verify the image builds before pushing:

```bash
docker build -t hcc:test .
docker run --rm -p 3001:3001 \
  -e DATABASE_URL="postgres://postgres:postgres@host.docker.internal:5432/hcc" \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
  -e NODE_ENV=production \
  hcc:test
```

Open <http://localhost:3001> — you should see the SPA, and
<http://localhost:3001/healthz> should return `{"status":"ok"}`.
