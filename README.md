# ProxyManager

ProxyManager is a Cloudflare Worker application for managing single proxy links,
remote subscription feeds, and custom export packs that can be shared as raw,
Clash.Meta, or sing-box subscriptions.

## Features

- Import single proxy URIs and raw/base64 subscriptions
- Import remote Clash YAML or sing-box JSON feeds
- Edit per-node metadata such as display name and tags without mutating the core payload
- Build custom subscription packs from selected nodes
- Append or remove items inside an existing custom pack
- Generate QR codes or copyable payloads for direct proxy URIs and custom subscription links
- Refresh remote feeds manually and via a 15-minute Cloudflare Cron trigger

## Stack

- Cloudflare Workers + Hono
- Cloudflare D1 for structured storage
- Cloudflare KV for future cache expansion
- React + Vite SPA for the admin UI
- Vitest + Testing Library for automated tests

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

   If `npm install` tries to compile `sharp` from source on a machine with a globally installed `libvips`, rerun:

   ```bash
   SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install
   ```

2. Create a D1 database and KV namespace:

   ```bash
   XDG_CONFIG_HOME=.wrangler-home npx wrangler d1 create proxymanager
   XDG_CONFIG_HOME=.wrangler-home npx wrangler kv namespace create CACHE
   ```

3. Export build-time variables before running Wrangler locally:

   ```bash
   export CF_D1_ID="<your-d1-database-id>"
   export CF_KV_ID="<your-kv-namespace-id>"
   export CF_WORKER_NAME="proxymanager"
   export CF_D1_NAME="proxymanager"
   ```

   Optional:

   ```bash
   export CF_CRON_SCHEDULE="*/15 * * * *"
   ```

4. Apply the D1 schema:

   ```bash
   XDG_CONFIG_HOME=.wrangler-home npx wrangler d1 migrations apply proxymanager --remote
   ```

5. Create a local `.dev.vars` file for runtime secrets:

   ```dotenv
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD_HASH=<sha256-hash>
   SESSION_SECRET=<long-random-secret>
   ```

   A committed `.dev.vars.example` template is included for local setup.

   Example password hash command:

   ```bash
   node -e "crypto.subtle.digest('SHA-256', new TextEncoder().encode(process.argv[1])).then(buf=>console.log(Buffer.from(buf).toString('hex')))" "change-me"
   ```

6. Start the worker:

   ```bash
   npm run dev
   ```

## Verification

```bash
npm test
npm run typecheck
npm run build
```

## GitHub import deployment on Cloudflare

1. Push the repository to GitHub.
2. In the Cloudflare dashboard, create a new Worker and choose the GitHub import flow.
3. In `Settings > Build`, set the build command to:

   ```bash
   npm run build:ci
   ```

   `build:ci` generates an untracked `wrangler.jsonc` from build variables and then builds the SPA. The repository does not store your real resource IDs.

4. Keep the deploy command as Cloudflare's default:

   ```bash
   npx wrangler deploy
   ```

5. In the Cloudflare Worker build settings, add build variables:

   - Required: `CF_D1_ID`, `CF_KV_ID`
   - Optional: `CF_WORKER_NAME`, `CF_D1_NAME`, `CF_CRON_SCHEDULE`

   These values are only used during the build step to generate `wrangler.jsonc`.

6. In `Settings > Variables & Secrets`, add runtime secrets:

   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH`
   - `SESSION_SECRET`

7. Make sure your Worker has:

   - D1 binding name: `DB`
   - KV binding name: `CACHE`

8. Run the D1 migration once before first use:

   ```bash
   XDG_CONFIG_HOME=.wrangler-home npx wrangler d1 migrations apply proxymanager --remote
   ```

9. After that, every push to the connected GitHub branch will trigger an automatic build and deploy.

## Public repo deployment model

- The repository is safe to keep public because it does not commit real `wrangler.jsonc`, D1 IDs, KV IDs, or runtime secrets.
- Build-only values such as `CF_D1_ID` and `CF_KV_ID` live in Cloudflare Workers Builds variables.
- Sensitive runtime values such as `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` live in Cloudflare runtime Secrets.
- Local-only runtime placeholders can live in `.dev.vars.example` without exposing real credentials.
- `npm run render:wrangler` generates a local `wrangler.jsonc` on demand for local development or Cloudflare build jobs.
- On development machines with a system `libvips`, `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install` avoids unnecessary `sharp` source builds.

## Notes

- The app treats imported nodes as available when they parse successfully and are enabled.
  It does not perform network liveness checks.
- Clash.Meta and sing-box exports filter out nodes that cannot be represented safely in
  the target profile and report skipped entries in the admin UI.
- Single-node QR sharing uses the direct proxy URI when that URI can be reconstructed.
