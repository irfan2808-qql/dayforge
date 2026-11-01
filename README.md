# DayForge

A personal productivity command center built with React, Vite, TypeScript, Tailwind, Supabase PostgreSQL/Auth, Recharts and Cloudflare Pages. **No demo records.** Dashboards use your actual private database rows.

## Included

- GitHub OAuth and authenticated routes; personal profile, Asia/Jakarta default timezone, light/dark themes.
- Task CRUD, custom categories, priorities, scheduled and due dates, recurring daily/weekly/monthly rules, editable per-date occurrences and completion history.
- Custom habit CRUD, daily check-ins, versioned weekly frequency targets, weekly habit streaks and heatmap.
- Numeric and milestone-based goals, progress events (including negative corrections), milestones, associated tasks and historical progress chart.
- Overview dashboard, date-filtered analytics, interactive calendar, searchable daily reflections, JSON backup/import and flat CSV export.
- RLS on **all 12 user tables**, composite ownership FKs, indexes, SQL recurrence-expansion function and authenticated account deletion Edge Function.
- Mobile bottom navigation and desktop sidebar; real empty, loading and error states.

## Prerequisites

- Node.js **20.19+** and npm; Git and a GitHub account.
- Free accounts with [Supabase](https://supabase.com/), [Cloudflare](https://dash.cloudflare.com/) and [GitHub](https://github.com/).
- These services may adjust their limits and policies; always check the current dashboard.
- **No credit card is required for the basic workflow** where Free-plan signup is available.

## 1. Install locally

```bash
git clone https://github.com/YOUR_USERNAME/dayforge.git
cd dayforge
npm install
cp .env.example .env.local
```

> If working from the downloadable ZIP, unpack it and run `npm install`; you do not need to clone anything.

Create a free Supabase project, then obtain **Project URL** and **publishable key** from Supabase Dashboard > Project Settings > API / Connect. Put them in `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

A legacy anon key may also be used in the publishable-key variable. **Never** use `service_role`, `sb_secret_*` or any private credential in `VITE_` variables. The browser key is public by design; security depends on RLS and carefully scoped functions.

## 2. Set up PostgreSQL

1. In the Supabase project open **SQL Editor**.
2. Copy and execute the full file `supabase/migrations/202610280001_initial.sql` **once**. It creates all tables, constraints, indexes, RLS policies, profile-creation trigger, and `ensure_task_occurrences` RPC.
3. Check that all public tables show RLS enabled under Table Editor and that the SQL query completed without errors.
4. Do not execute this SQL in a database that already contains tables with these names; this is the initial migration for a new project.
5. If you are using the Supabase CLI locally, you can instead run `supabase link --project-ref YOUR_PROJECT_REF` followed by `supabase db push` (CLI installation required). SQL Editor requires no CLI.

**Important**: Rows use a real authenticated user's ID. The app creates no fabricated tasks or habits. If the migration is missing, the UI shows a configuration/error state rather than fake data.

## 3. Configure GitHub OAuth

1. In Supabase Dashboard > Authentication > Providers > GitHub, copy the exact **Callback URL** (usually `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`).
2. In GitHub > Settings > Developer settings > OAuth Apps > **New OAuth App**:
   - Application name: `DayForge`.
   - Homepage URL: `http://localhost:5173` for the initial local OAuth app. You can update the homepage to your Cloudflare production address later; the callback remains Supabase's URL.
   - Authorization callback URL: the **Supabase** callback from step 1, **not** `localhost:5173`.
3. Copy GitHub OAuth **Client ID** and **Client secret** to Supabase's GitHub provider configuration (never to frontend environment variables).
4. Enable GitHub sign-in in Supabase.
5. Supabase > Authentication > URL Configuration:
   - Development Site URL: `http://localhost:5173`.
   - Additional Redirect URLs: `http://localhost:5173/**`.
   - After deployment, set Site URL to `https://YOUR_PAGES_SUBDOMAIN.pages.dev` and add `https://YOUR_PAGES_SUBDOMAIN.pages.dev/**` to Additional Redirect URLs. Keep localhost in the allowlist for development.
6. Start the app with `npm run dev` and sign in with GitHub. The OAuth provider redirects via Supabase back to the app; Supabase JS handles the PKCE code.

The OAuth App is owned by **you**. No GitHub provider secrets are stored in this repository.

## 4. Run and verify locally

```bash
npm run dev          # http://localhost:5173
npm run typecheck
npm run lint
npm run test         # Vitest progress / timezone tests
npm run test:logic   # Dependency-free Node test runner for core progress logic
npm run build        # Creates production static assets in dist/
npm run preview      # Preview the production build
```

Check this authenticated sequence manually: create a category; create a one-time task and mark it complete; reload; edit a historical day; create a recurring weekly task and inspect next week; create a 3x/week habit and record check-ins; create numeric/milestone goals; save a reflection; verify dashboard and analytics change; export JSON; inspect calendar; open the app in another browser/device with the **same GitHub identity** and check persistence. RLS should be tested with a separate **second** GitHub identity (see security section).

## 5. Deploy on Cloudflare Pages Free

1. Create a new GitHub repository (e.g. `dayforge`). Keep `.env.local` **out of Git**.
2. From your downloaded DayForge folder, initialize and push:

```bash
git init
git branch -M main
git add .
git commit -m "Build DayForge productivity tracker"
git remote add origin https://github.com/YOUR_USERNAME/dayforge.git
git push -u origin main
```

3. Sign in to Cloudflare Dashboard > **Workers & Pages** > **Create** > **Pages** > **Import an existing Git repository**. Authorize GitHub and select `dayforge`.
4. Configure: **Framework preset React (Vite)**; **production branch `main`**; **build command `npm run build`**; **build output directory `dist`**; **root directory `/`**; Node.js 22 recommended.
5. Under Pages environment variables (Production and optionally Preview) set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` exactly as used locally; trigger a new deployment if added after the first build.
6. Deploy. Cloudflare assigns a public HTTPS address, typically `https://YOUR_PAGES_SUBDOMAIN.pages.dev`. This default `pages.dev` address is sufficient indefinitely as long as your project exists and the free plan remains available; no custom domain is required.
7. Set the production Site URL and Additional Redirect URLs in Supabase as described in section 3, and update GitHub OAuth App Homepage URL to your production Pages URL (the GitHub callback still points to Supabase).
8. Visit the live URL, sign in, save a task, refresh, and check that the data persists. Test navigation refresh on `/tasks`, `/habits` and `/analytics` (Cloudflare SPA fallback uses `public/_redirects`).
9. Push another commit to `main`. Cloudflare Pages automatically rebuilds and redeploys from GitHub. New pull requests can get preview deployments.

**Do not share your OAuth Client Secret** with Cloudflare Pages or Vite. Only Supabase Auth needs it.

## 6. Deploy account deletion (optional until needed, required for full settings feature)

The UI asks for exact `DELETE MY ACCOUNT` confirmation. Its privileged deletion happens only on a Supabase Edge Function, never in Vite's client bundle:

```bash
# Requires the free Supabase CLI plus authenticated project access.
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy delete-account
```

Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions; the service role remains **server-side**. The function authenticates the bearer token via `getUser()`, requires explicit confirmation, then hard-deletes the Auth user; `ON DELETE CASCADE` removes associated profile/data. Do not disable Edge Function JWT verification. For production, consider restricting CORS to your known origin as defense in depth.

## 7. How analytics works

- **Daily task completion:** scheduled occurrences completed / all scheduled occurrences. **Empty day = `null` (displayed as `—`), never 100%.**
- **Weekly / monthly task productivity:** completed occurrences in period / scheduled occurrences in period, **weighted by number of tasks**, not the unweighted average of percentages.
- **Recurring tasks:** the authenticated SQL RPC `ensure_task_occurrences` expands daily, weekly (ISO Monday 1–Sunday 7), and monthly schedules into unique `(task_id, activity_date)` rows. Monthly schedules on days 29–31 clamp to the end of short months. The RPC is bounded to a 371-day range per call and uses `ON CONFLICT DO NOTHING`, preserving completed/edited occurrences. The app materializes the past year and coming months on load, and specific navigated calendar months on demand. The analytics page expands any selected historic date range on demand, so older recurring schedules can be counted even if their months were not previously visited.
- **Habit consistency:** weekly check-ins / target (capped at 100%). A newly started or archived partial week caps its requirement by the number of eligible days. Frequency revisions apply from the next Monday, except a change on Monday applies immediately; prior full weeks retain their historical target.
- **Habit streak:** consecutive calendar weeks that met the weekly target. The unfinished current week doesn't break a prior successful run. **Daily activity streak** counts consecutive local dates with any completed task or habit check-in, allowing yesterday as the current streak when today is still empty.
- **Numeric goals:** `initial_value + sum(delta_value)` across stored progress events, clamped to [0,100] percent of target. Corrections use negative deltas. Historic charts sum only events dated on/before each point.
- **Milestone goals:** completed milestones / all milestones, with completion dates; no milestones = unknown percent. Changes in milestone definitions can change historical percentages.
- Dates are calendar days in the profile's configured IANA timezone (default `Asia/Jakarta`) and stored as PostgreSQL `date`, to avoid UTC midnight skew. Historical check-in dates are deliberately not shifted when the timezone setting changes.
- Never rely on example statistics in production; an empty account shows zero counts and `—` rates.

## 8. Security checklist

- Auth is GitHub OAuth through Supabase Auth (PKCE), not GitHub API-token storage.
- RLS is enabled for all personal and child tables, with ownership checks for `SELECT`, `INSERT`, `UPDATE`, `DELETE` and composite same-owner FKs.
- Backend validates names, rating ranges, date/weekly frequency and statuses with PostgreSQL `CHECK`, `UNIQUE`, FKs; frontend validates common form fields and import structure. Keep service role keys out of the frontend.
- **Cross-user test**: Sign in as User A, create a task and capture its ID. Sign out; sign in as User B. Verify A's task does not appear. Using User B's authenticated Supabase REST client, try selecting/updating/deleting A's ID: each must return no accessible rows. Try inserting a User-B task referencing a category/goal belonging to User A: the composite FK must block it. This cannot be meaningfully run without two live accounts.
- No analytics, telemetry or paid service credentials are shipped by the app.
- JSON import validates structure, record IDs, reference completeness and allowed fields; database constraints validate typed values. It is ordered and idempotent for same IDs **but not an atomic transaction across HTTP calls**. Partial imports are possible on failure; always export a backup before importing.
- CSP permits same-origin frontend and Supabase HTTPS/WebSocket access, with Google Fonts allowed. Tighten headers if you add new third-party assets.

## 9. Free-tier limitations and tradeoffs

- **Cloudflare Pages Free**: 500 builds/month is typically enough for an individual; build time, project and asset limits also apply. React static Pages hosting includes `pages.dev` and HTTPS.
- **Supabase Free**: database/storage/egress/function limits are shared with other apps using the project. Supabase may **pause inactive Free projects** after about one week of low database activity. Free cannot promise uninterrupted uptime. Resume it from your dashboard if paused.
- External GitHub OAuth and Supabase services are free at normal personal usage but subject to policy changes. Provider emails, verification and signup may have separate limitations; GitHub OAuth avoids dependence on Supabase's restricted default outbound email for sign-in.
- No continuous server is required, but active session/sync requires an internet connection; **DayForge is not an offline-first app**.
- The client currently reads all rows for a user's workspace into memory. This is reasonable for personal datasets, not for very large workspaces with millions of events. A later version can add pagination and server-side aggregate RPCs.
- Old recurrence ranges are materialized on demand when analytics dates or calendar months are selected. For a large dataset, the initial chart may show prior cached data during expansion; wait for the loading indicator before interpreting the result. For enterprise-scale history, a SQL query combining virtual planned occurrences with stored exceptions would perform better.
- The included CSS pulls Google Fonts over the internet; system fonts are the fallback. If you need zero font-network requests, remove the CSS `@import`.
- **No dependency lockfile is included in the source ZIP**, because the build environment may not have npm registry access. After `npm install`, commit the generated `package-lock.json` to make future deployments reproducible. Cloudflare can then use `npm ci` automatically.

## Project layout

```text
src/App.tsx                  auth/session, workspace data loading, routing and shell
src/features/               dashboard, tasks, habits, goals, analytics, calendar, journal, settings
src/lib/progress.ts          tested pure progress and streak calculations
src/lib/dates.ts             calendar date and timezone helpers
src/lib/supabase.ts          authenticated data loading and recurring instance expansion
src/lib/backup.ts            JSON import/export, flat CSV export
supabase/migrations/         initial PostgreSQL schema and RLS
supabase/functions/          server-side account deletion
src/tests/                  Vitest core logic tests
tests/logic.cjs              offline executable Node tests
public/_headers             security headers for Cloudflare Pages
public/_redirects           Cloudflare SPA route fallback
```

## Docs

- [Supabase GitHub OAuth](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Cloudflare Pages React deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [Supabase Free project pausing](https://supabase.com/kb/faqs/platform/free-project-pausing)
