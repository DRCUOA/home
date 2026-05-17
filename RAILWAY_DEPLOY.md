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

**Why:** the app writes uploaded files (photos, documents) to a folder
called `./uploads` inside the container. Containers are wiped on every
redeploy, so without a volume your files would vanish each time you
push a change. A volume is a persistent disk that survives redeploys
and attaches at a path inside the container.

**Why exactly `/app/uploads`:** the Dockerfile sets `WORKDIR /app`, and
the upload code resolves the storage folder relative to the working
directory (`process.cwd() + "/uploads"`). If you mount somewhere else,
uploads will land outside the volume and disappear on redeploy.

**Steps in the Railway dashboard:**

1. Open your project, then click the **service tile** (the one that
   represents your app, *not* the Postgres tile).
2. Click the **Settings** tab at the top of the service panel.
3. Scroll down to the section labelled **Volumes**.
4. Click **+ New Volume**. A small form appears.
5. Fill it in exactly like this:
   - **Mount path:** `/app/uploads` (type it; no autocomplete)
   - **Size:** `5` (units are GB; default's fine; you can grow it later
     with a click)
6. Click **Add** (or **Create**, depending on UI version).

**What happens next:** Railway shows the volume as "Attaching" for a
few seconds, then "Mounted." It will also trigger a redeploy of your
service so the container restarts with the volume attached.

**Verifying it worked (after your next deploy):**

```bash
railway run --service <your-service-name> ls -la /app/uploads
# Expected: shows an empty directory (or your existing files, owned by user "nodejs")
```

If you see `ls: cannot access '/app/uploads'`, the mount path is wrong
— delete the volume and re-add with the exact path above.

> **Note on scaling.** A Railway volume attaches to one container only.
> If you ever turn replicas above 1, uploads from one replica won't be
> visible to the others. Migrate to S3/R2 before scaling horizontally
> — `@aws-sdk/client-s3` is already a dep; only
> `packages/api/src/routes/files.ts` needs the rewrite.

---

## Step 5 — Set the environment variables

**Where:** Service → **Variables** tab → **+ New Variable** for each
row below. (Or use **Raw Editor** in the top-right of the Variables
tab to paste them in one go.)

For each variable, click **+ New Variable**, type the name in the left
field, paste the value in the right field, and click **Add**.

### 5a. Easy ones

| Name | Value | How to get it |
|---|---|---|
| `NODE_ENV` | `production` | Type it literally |
| `LLM_MODEL` | `gpt-4o-mini` | Cheap + capable default. Use `gpt-4o` if you want better quality at higher cost |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | Public demo router. Replace later if you self-host |

### 5b. Database (already done in Step 3, included for completeness)

| Name | Value |
|---|---|
| `DATABASE_URL` | Type `${{` and pick `Postgres.DATABASE_URL` from the autocomplete. **Do not paste the literal URL** — the reference form auto-updates if the DB credentials rotate |
| `DATABASE_SSL` | `false` (the internal URL doesn't need SSL) |

### 5c. JWT secrets (generate on your machine, paste into Railway)

These sign user session cookies. They must be long and random. **Use
two different values** — `JWT_SECRET` signs short-lived access tokens,
`JWT_REFRESH_SECRET` signs longer-lived refresh tokens.

On your laptop (Mac/Linux), run this **twice** to generate two
different values:

```bash
openssl rand -base64 48
# → e.g. dB7sZ9qY+...long random string with letters, digits, /, +, =
```

| Name | Value |
|---|---|
| `JWT_SECRET` | First `openssl` output |
| `JWT_REFRESH_SECRET` | Second `openssl` output (must be different from above) |

**Important:** if you ever change these later, all logged-in users get
signed out (their existing cookies become invalid). That's fine, just
expected.

### 5d. CORS

Set this to a placeholder for now — you'll update it in Step 6 once
you know your domain.

| Name | Value |
|---|---|
| `CORS_ORIGIN` | `http://localhost:5173` for now |

### 5e. Stripe (test mode is fine for first deploy)

In **Stripe Dashboard** (https://dashboard.stripe.com), top-right
toggle: **Test mode** on (orange chip). For real customers later,
switch to Live mode and replace these.

1. Left sidebar → **Developers → API keys**.
2. Reveal **Secret key** → copy the value beginning with `sk_test_…`
   (or `sk_live_…` if you're in Live mode).

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | The `sk_test_…` or `sk_live_…` value |
| `STRIPE_WEBHOOK_SECRET` | Leave **unset** for now. You'll add this in Step 7 |

### 5f. OpenAI

1. Go to https://platform.openai.com/api-keys.
2. **+ Create new secret key** → name it `home-control-centre-prod` →
   copy the `sk-…` value immediately (you cannot see it again).
3. Make sure your OpenAI account has a billing method attached, or
   API calls will 401.

| Name | Value |
|---|---|
| `OPENAI_API_KEY` | The `sk-…` value |

### 5g. Maps (optional but recommended)

**Google Maps** — needed for address autocomplete and geocoding:

1. https://console.cloud.google.com → create project (or pick an
   existing one) → **APIs & Services → Library**.
2. Enable: **Places API**, **Geocoding API**, **Maps JavaScript API**.
3. **Credentials → + Create credentials → API key**. Copy it.
4. Click the key → **Application restrictions** → **HTTP referrers**
   → add your Railway domain once you have it (Step 6). Until then,
   leave unrestricted — but **revisit this after Step 6** or anyone
   with your key can run up your bill.

| Name | Value |
|---|---|
| `GOOGLE_MAPS_API_KEY` | The Google key |

**LINZ Basemaps** — needed for NZ-specific aerial / topo layers (skip
if you're not in NZ):

1. https://basemaps.linz.govt.nz/login → **My API Keys** → create one.

| Name | Value |
|---|---|
| `LINZ_BASEMAP_API_KEY` | The LINZ key (or leave unset if unused) |

### Sanity check

In the Variables tab you should now see roughly 11 entries. Anything
you skip will simply mean that part of the app degrades:

- No `OPENAI_API_KEY` → the assistant tab errors when used
- No `STRIPE_SECRET_KEY` → billing routes 500
- No `GOOGLE_MAPS_API_KEY` → maps render blank tiles
- No `LINZ_BASEMAP_API_KEY` → NZ-specific aerial layers don't load

Railway will redeploy automatically each time you save a variable. To
avoid a flurry of mini-deploys, use **Raw Editor** to paste them all
at once.

---

## Step 6 — Generate a domain and lock down CORS

**Steps in Railway:**

1. Service → **Settings** tab → scroll to **Networking**.
2. Under **Public Networking**, click **Generate Domain**.
3. Railway shows something like `home-production-a1b2.up.railway.app`.
   Copy the full URL (you'll need it).

**Update `CORS_ORIGIN`:**

4. Variables tab → find `CORS_ORIGIN` → click the value → replace with
   the **full URL including `https://`** and **no trailing slash**:
   ```
   https://home-production-a1b2.up.railway.app
   ```
   Common mistakes:
   - ❌ `home-production-a1b2.up.railway.app` (missing `https://`)
   - ❌ `https://home-production-a1b2.up.railway.app/` (trailing slash)
   - ✅ `https://home-production-a1b2.up.railway.app`

5. Railway redeploys automatically. Wait ~30s for the green tick.

**Custom domain (optional, can do later):**

6. Same Networking panel → **+ Custom Domain** → type
   `app.yourdomain.com` (or whatever you want).
7. Railway shows a **CNAME** record to add at your DNS provider
   (Cloudflare / Namecheap / etc). Add it, wait a minute or two for
   DNS to propagate.
8. Once Railway shows the green padlock, update `CORS_ORIGIN` again
   to point at the custom domain instead of the railway.app one.

**Why CORS matters:** the API rejects cross-origin requests that don't
match `CORS_ORIGIN`. If you mistype it, every API call from the
browser fails with a CORS error in the console and users see a broken
site. Test in Step 8.

---

## Step 7 — Configure the Stripe webhook

**What this does:** Stripe will POST to your API whenever a customer
finishes checkout or changes their subscription. The signing secret
proves the request really came from Stripe.

**This app currently handles these three events** (from
`packages/api/src/routes/billing.ts`):

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

**Steps in Stripe Dashboard:**

1. Top-right toggle: choose **Test mode** for the first deploy (or
   **Live mode** if you're already taking real payments).
2. Left sidebar → **Developers → Webhooks**.
3. Click **+ Add endpoint**.
4. **Endpoint URL:** paste this exactly, replacing the domain with
   yours from Step 6:
   ```
   https://home-production-a1b2.up.railway.app/api/v1/billing/webhook
   ```
5. **Description:** `Home Control Centre — Railway`
6. **Events to send:** click **+ Select events**, then in the search
   box tick exactly these three:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
7. Click **Add events** then **Add endpoint**.

**Copy the signing secret:**

8. On the new webhook's detail page, find **Signing secret** (right
   side of the header). Click **Reveal**.
9. Copy the value — it starts with `whsec_…`.

**Paste into Railway:**

10. Railway → Service → **Variables** → find `STRIPE_WEBHOOK_SECRET`
    (or click **+ New Variable** if it isn't there yet).
11. Paste the `whsec_…` value → **Add** (or **Save**).
12. Railway redeploys automatically. Wait ~30s.

**Verify the webhook can reach your app:**

13. Back in Stripe → your webhook → click **Send test webhook** →
    pick `checkout.session.completed` → **Send test**.
14. After a few seconds, the **Recent deliveries** list shows the
    request with status `200`. If it's `400` or `401`, the
    `STRIPE_WEBHOOK_SECRET` was pasted wrong — re-copy and re-save.

> **Test → Live switchover.** When you flip Stripe to Live mode, the
> `sk_test_…` and `whsec_…` values are completely different. You'll
> need to re-do steps 1–11 above in Live mode and update both
> `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Railway.

---

## Step 8 — Verify the deployment

### 8a. Healthcheck

From any terminal:

```bash
curl -i https://home-production-a1b2.up.railway.app/healthz
```

You want to see:

```
HTTP/2 200
content-type: application/json; charset=utf-8

{"status":"ok"}
```

If you see anything else:

| What you see | What it means |
|---|---|
| `HTTP/2 502` or `HTTP/2 503` | Container is crashing on boot. Open Railway → **Deployments** → click the latest one → **View Logs** and look for the error |
| `HTTP/2 200` but body is HTML | Healthcheck route isn't hitting `/healthz` — check the deploy actually picked up the latest commit |
| Connection error / wrong host | Wrong domain. Re-check the URL from Step 6 |

### 8b. Browser walk-through (the "golden path")

Open the domain in a private/incognito window so cookies don't lie to
you.

Tick each one as you go:

- [ ] **SPA renders.** You see the landing page, not a JSON error.
- [ ] **Sign up.** Create a new test account with a real-looking email
      and any password. You should land on the dashboard.
- [ ] **Persistence.** Close the tab, re-open in a fresh tab to the
      same domain. You should still be signed in (proves the JWT
      cookie is being set with `secure: true` and surviving).
- [ ] **File upload.** Go to any page that lets you upload (e.g. add a
      file in Library or attach a photo to a property). Upload a
      small image.
- [ ] **Volume works.** Trigger a redeploy (Railway → **Deployments**
      → ⋯ → **Redeploy**), wait, then open the file again. It should
      still be there. *If it's missing, the volume mount is wrong —
      back to Step 4.*
- [ ] **Stripe webhook.** Go to a route that creates a checkout
      session (Settings → Billing → Upgrade, or whatever your flow
      is). Complete a test checkout using card `4242 4242 4242 4242`,
      any future expiry, any CVC. Back in Stripe Dashboard →
      Webhooks → your endpoint → confirm the
      `checkout.session.completed` delivery shows status `200`.
- [ ] **Bulk-delete labels** (smoke test the latest feature). Moving
      → Tools → Print labels → tick 2 boxes → Delete selected →
      confirm. The list shrinks; items inside the deleted boxes are
      now unassigned.
- [ ] **Print copies.** Same screen → click the printer icon on one
      row → set Copies to 3 → Print. The browser print preview shows
      that label three times.

### 8c. Tail logs while you test

In a second terminal:

```bash
railway logs --service <your-service-name>
```

Watch for:
- ✅ `API running on http://localhost:3001` after boot
- ✅ HTTP 2xx for the requests you make
- ❌ Repeated 401/500 — paste a few lines back and we can diagnose

### 8d. Done

If every box above is ticked, the deploy is healthy. Some routine
follow-ups for the first week:

- Lock down the Google Maps key to your domain (Step 5g note).
- Set a **usage alert** in Railway → Project → **Settings → Usage**
  to avoid bill surprises.
- Flip Stripe to **Live mode** when you're ready to take real money,
  redoing the keys in Step 5e and Step 7.

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
