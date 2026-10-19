# Deploying to Cloudflare

The app runs on **Cloudflare Workers** through the OpenNext adapter
(`@opennextjs/cloudflare`). A static Cloudflare Pages export would not work:
the app needs a server for its API routes (`app/api/*`), the sign-in guard
(`proxy.ts`) and signed session cookies.

| File | Purpose |
| --- | --- |
| `wrangler.jsonc` | Worker name (`emts-replica`), Node.js compatibility, static assets |
| `open-next.config.ts` | Adapter settings (no R2 cache: the app has no ISR or data cache) |
| `package.json` scripts | `preview`, `deploy`, `upload`, `cf-typegen` |

## Plan

The compressed Worker is about **5 MB**. The Workers Free plan allows 3 MB, so
the account needs **Workers Paid** (10 MB limit).

## Deploy on every push (Workers Builds)

1. Cloudflare dashboard › **Workers & Pages** › **Create** › **Import a repository**.
2. Pick `loren-abroadworks/estimates-master-phase-2`, branch `main`.
3. Build settings:
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
   - Non-production branch deploy command (optional): `npx opennextjs-cloudflare upload`
4. Save and deploy. Every push to `main` then builds and deploys. The site is
   served at `https://emts-replica.<your-subdomain>.workers.dev`; a custom
   domain can be added under the Worker's **Settings › Domains & Routes**.

The project name in Cloudflare must match `"name"` in `wrangler.jsonc`.

## Environment variables

Set under the Worker's **Settings › Variables and Secrets** (use *Secret* for keys).

| Variable | Needed | Notes |
| --- | --- | --- |
| `AUTH_MODE` | No | Unset = demo sign-in: **any username and password get in**. Set `real` to check passwords. |
| `AUTH_SECRET` | With `AUTH_MODE=real` | 32+ random characters; signs the session cookie. |
| `AUTH_OWNER_PASSWORD` | With `AUTH_MODE=real` | The owner's first password. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | No | Without them each browser keeps its own copy of the data (localStorage). With them everyone shares one copy. |
| `SUPPLIER_*` | No | Live supplier integration; see `.env.example`. |

Note: without Supabase, passwords set in the app and the sign-in lockout live
in one Worker instance's memory and are lost when it restarts.

## From your machine

```bash
npm run preview   # build and run locally in the Workers runtime (http://localhost:8787)
npx wrangler login
npm run deploy    # build and deploy
```

The build prints "Duplicate key" warnings from the job scheduling translations;
they are harmless.
