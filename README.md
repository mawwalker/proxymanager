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
- Cloudflare KV for lightweight cache and future expansion
- React + Vite SPA for the admin UI
- Vitest + Testing Library for automated tests

## GitHub import deployment on Cloudflare

1. Push the repository to GitHub.
2. In the Cloudflare dashboard, create a new Worker and choose the GitHub import flow.
3. In `Settings > Build`, set the build command to:

   ```bash
   npm run build:ui
   ```

4. Keep the deploy command as Cloudflare's default:

   ```bash
   npx wrangler deploy
   ```

5. The committed `wrangler.jsonc` declares only the binding names:

   - D1 binding name: `DB`
   - KV binding name: `CACHE`

   With Cloudflare automatic resource provisioning enabled, the first GitHub deploy can create the real D1 and KV resources and attach these bindings automatically.

6. Do not add D1 IDs, KV IDs, `D1_NAME`, or similar values in `Build` variables or `Variables & Secrets`.

   - D1 and KV bindings are deployment-time configuration, read from `wrangler.jsonc` by `wrangler deploy`.
   - Runtime variables cannot create or replace a missing D1 or KV binding.
   - After the first deploy, you can verify in Worker `Settings > Bindings` that `DB` and `CACHE` already exist and point to real resources.
   - The committed `wrangler.jsonc` sets `keep_vars: true`, so GitHub-triggered `wrangler deploy` will keep dashboard-managed runtime variables instead of deleting them on the next deploy.

7. In `Settings > Variables & Secrets`, add only runtime secrets used by the app:

   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH`
   - `SESSION_SECRET`

   For sensitive values such as `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`, prefer adding them as Secrets in the dashboard instead of plain text Variables.

   `SESSION_SECRET` must be a non-empty random string. For example:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Example password hash command:

   ```bash
   node -e "crypto.subtle.digest('SHA-256', new TextEncoder().encode(process.argv[1])).then(buf=>console.log(Buffer.from(buf).toString('hex')))" "change-me"
   ```

8. The Worker bootstraps its initial D1 tables on first access. No extra migration command is required.

9. After that, every push to the connected GitHub branch will trigger an automatic build and deploy.

## Public repo deployment model

- The repository is safe to keep public because it does not commit real D1 IDs, KV IDs, or runtime secrets.
- `wrangler.jsonc` is committed and declares only binding names, which works with Cloudflare's automatic resource provisioning for KV and D1.
- Sensitive runtime values such as `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` live only in Cloudflare `Variables & Secrets`.

## Notes

- The app treats imported nodes as available when they parse successfully and are enabled.
  It does not perform network liveness checks.
- Clash.Meta and sing-box exports filter out nodes that cannot be represented safely in
  the target profile and report skipped entries in the admin UI.
- Single-node QR sharing uses the direct proxy URI when that URI can be reconstructed.
