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

2. Create a D1 database and KV namespace, then replace the placeholder IDs in
   [wrangler.jsonc](/tmp/proxymanager-mvp/wrangler.jsonc).

3. Apply the D1 schema:

   ```bash
   XDG_CONFIG_HOME=.wrangler-home npx wrangler d1 migrations apply proxymanager
   ```

4. Set secrets:

   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH`
   - `SESSION_SECRET`

   Example password hash command:

   ```bash
   node -e "crypto.subtle.digest('SHA-256', new TextEncoder().encode(process.argv[1])).then(buf=>console.log(Buffer.from(buf).toString('hex')))" "change-me"
   ```

5. Start the worker:

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
3. Point the build command at `npm run build:ui`.
4. Ensure `wrangler.jsonc` is present in the repo root so Worker bundling picks up
   the Worker entrypoint, static asset directory, bindings, and cron trigger.
5. In the Worker settings, create the D1 binding `DB`, the KV binding `CACHE`, and
   set the three secrets listed above.
6. Run the D1 migration from the dashboard or Wrangler before first use.

## Notes

- The app treats imported nodes as available when they parse successfully and are enabled.
  It does not perform network liveness checks.
- Clash.Meta and sing-box exports filter out nodes that cannot be represented safely in
  the target profile and report skipped entries in the admin UI.
- Single-node QR sharing uses the direct proxy URI when that URI can be reconstructed.
