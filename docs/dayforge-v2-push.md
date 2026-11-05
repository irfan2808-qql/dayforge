# DayForge V2 — Manual Git Push (verified V1 integration)

This release is tailored to the **public** `irfan2808-qql/dayforge` V1 repository (branch `main`, audited 2026-11-03). It contains the Web Push implementation, plus a **new integration installer** for the existing Settings page. No GitHub write access or automatic production changes are required.

## Fast path on Linux

```bash
cd ~/Downloads/dayforge
git status --short  # make sure working tree is clean
git switch -c feature/dayforge-v2-push
# Unzip this release elsewhere, for example ~/Downloads/DayForge_V2_Manual_Push_Ready/
python3 ~/Downloads/DayForge_V2_Manual_Push_Ready/scripts/install-and-integrate-dayforge-v1.py "$PWD"
npm ci
npm run typecheck && npm run lint && npm run test && npm run build
node scripts/check-worker.mjs
git add src/features/Settings.tsx src/features/reminders index.html public/dayforge-* \
  supabase/migrations/202611030001_push_reminders.sql workers/reminder-dispatcher \
  scripts/check-worker.mjs scripts/generate-vapid.mjs docs/dayforge-v2-push.md
git commit -m "feat: add DayForge V2 push reminders"
git push -u origin feature/dayforge-v2-push
```

**Important:** `git push` sends *source code only*, not Supabase migration, Worker deployment, VAPID secrets, or Pages production rollout. The new feature cannot deliver actual scheduled notifications until these are configured. Read the instructions below. Never commit `.env.local` or VAPID private key. A branch pushed to GitHub does not necessarily deploy to production; merge to `main` only after tests pass.

**Smart completion:** the selected existing habit, task or goal is linked by real UUID; the privileged dispatcher checks V1 habit check-ins, weekly habit goals, task occurrence completion, and goal completion/progress before sending. Manual reminders are supported without linking. Changes to completion made *after* a push is already sent cannot unsend it.

---

# DayForge V2 — Web Push Reminder Add-on

**Status:** working standalone implementation package, **not deployed** and **not merged** into DayForge V1. This revision incorporates verified V1 route, Supabase client and activity models and offers a non-destructive V1 integration installer.

## Included

- React settings page: create/list/pause/delete reminders (habit, task, goal, daily check-in), daily, selected weekdays, one-off date/time; local test notification; enable/disable subscriptions per device; mark an activity complete for today.
- Supabase migration: 4 new tables, user-level RLS, timezone-aware schedule function, atomic cron queue + worker-only privileged RPCs, retry and deduplication.
- Root service worker with push handler and notification click handling.
- Cloudflare Worker cron dispatcher with native WebCrypto AES128GCM Web Push + VAPID signing, limited delivery attempts, endpoint allowlist.
- VAPID key generator and Web Push crypto tests.
- Optional standalone PWA manifest and icons.

## 0. Integrate with the existing DayForge checkout

Inside this package, run:

```bash
bash scripts/install-into-dayforge.sh /home/zrn/Downloads/dayforge
```

The legacy installer copies only new files; prefer the **new** `scripts/install-and-integrate-dayforge-v1.py` command above to also link the real Settings page. Neither script commits or deploys. Prefer a new Git branch first:

```bash
cd /home/zrn/Downloads/dayforge
git switch -c feature/dayforge-v2-push
```

Or copy the included folders manually. Inspect all files before running any migration in production.

## 1. Apply SQL migration

Use the existing Supabase CLI migration workflow, or run `supabase/migrations/202611030001_push_reminders.sql` in Supabase SQL Editor **once**, after reviewing it. It adds `df_`-prefixed tables and does not rename/drop any old tables.

**Security:** Only the `service_role` may execute the scheduler RPCs. Authenticated users have RLS on their own reminders/subscriptions/completions. The cloud Worker alone uses the service key.

## 2. Generate VAPID keys

Run in the package root:

```bash
node scripts/generate-vapid.mjs
```

Save the generated *public* and *private* keys. Do not commit the private key, share it in chat, or put it into `VITE_` variables.

Add the **public** key to DayForge Vite `.env.local` and to Cloudflare Worker secrets:

```env
VITE_DAYFORGE_VAPID_PUBLIC_KEY=<PUBLIC_KEY>
```

Vite will expose the public key to browsers (intended). Redeploy the site after changing Vite env vars in Cloudflare Pages. Add the public key to Cloudflare Pages settings as `VITE_DAYFORGE_VAPID_PUBLIC_KEY` too.

## 3. Deploy Cloudflare Worker

```bash
cd /home/zrn/Downloads/dayforge/workers/reminder-dispatcher
npm install
npx wrangler login
```

In `wrangler.toml`, replace `https://YOUR_PROJECT.supabase.co` with the **existing** project URL. Run these commands, entering the values interactively when prompted:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_SUBJECT
npx wrangler deploy
```

Set `VAPID_SUBJECT` to a real contact such as `mailto:admin@yourdomain.example` (replace with an address you control). `SUPABASE_SERVICE_ROLE_KEY` must be the **legacy JWT service_role key** for this implementation; do not use the anon/public key. The app uses its pre-existing browser-safe Supabase credentials.

Cron schedule: `* * * * *` (once per minute). The Free plan has a strict CPU-time budget; monitor Cron CPU and errors, and keep delivery batch sizes small. Web Push is *best effort*, not an exact-time alarm.

## 4. Add settings UI to DayForge

Use the existing authenticated Supabase client imported from your V1 app. Example only (adjust import paths to the real project):

```tsx
import {ReminderSettings} from './features/reminders/ReminderSettings';
import {supabase} from './lib/supabase'; // EXAMPLE; use your actual V1 client path

export function DayForgeReminderPage() {
  return (
    <ReminderSettings
      supabase={supabase}
      vapidPublicKey={import.meta.env.VITE_DAYFORGE_VAPID_PUBLIC_KEY}
    />
  );
}
```

Add this page to the existing Settings UI or route. Do **not** create a second Supabase client or change the V1 auth flow. On the front-end, `@supabase/supabase-js` and React must already be installed (as in the DayForge stack).

## 5. Service worker integration (important)

This is the only step that depends on the current V1 PWA setup:

**A. No existing root service worker:** the UI automatically registers `/dayforge-push-sw.js` with root scope. In `index.html`, if you have no PWA manifest, add:

```html
<link rel="manifest" href="/dayforge-v2.webmanifest" />
```

**B. Existing PWA service worker:** do **not** replace it; add the push and `notificationclick` listeners from `public/dayforge-push-sw.js` to your existing service worker (or import it if your service worker uses classic scripts). Then set the UI prop `allowExistingServiceWorker={true}`. Your existing worker must actually handle push notifications before setting this prop.

This explicit guard avoids accidentally breaking V1 offline/caching behavior. The user must click **Aktifkan** to request browser permission. On iPhone, the DayForge web app needs to be added to the Home Screen before Push works (iOS 16.4+).

## 6. Smart reminder integration with V1 activities

V1 models and table names have now been inspected. The new integration connects to the real workspace and the privileged SQL helper checks completion automatically for linked records. You can also call the functions below manually when useful. Link notifications by writing the V1 activity UUID into `df_reminder_rules.source_id`, using the `addReminder(...)` API and `source_id` field. When the user marks a habit complete, call:

```ts
import {markReminderDoneForDate,stopRemindersForSource} from './features/reminders/client';

// If a habit reminder with ID reminderId was completed for the user's local day:
await markReminderDoneForDate(supabase, reminderId, '2026-11-03');

// If a task/goal with the given V1 UUID is now fully complete:
await stopRemindersForSource(supabase, 'task', taskId);
```

Use the user's selected timezone to derive the ISO local date; do not derive it from UTC. To support edits to historical habit records, call `unmarkReminderDoneForDate` when completion is reversed. This package already includes a standalone **Selesai hari ini** button; automatic V1 event integration must be wired after examining actual V1 models and handlers.

**Known distinction:** The built-in `Tes lokal` only validates the permission and service worker. To test actual server push, subscribe and create a one-off reminder several minutes in the future; close the site tab and verify the notification arrives.

## 7. Verification checklist

- `cd workers/reminder-dispatcher && npx tsc --noEmit -p tsconfig.json` passes.
- `node scripts/check-worker.mjs` in the *package* verifies crypto encryption/decryption, VAPID signatures, endpoint filtering.
- Apply migration once, then test authentication and cross-account RLS in Supabase.
- Register push on Chrome/Firefox desktop and Android Chrome, with permission granted.
- Add PWA to iPhone Home Screen, then test Safari web app on an actual iPhone.
- Create a one-off reminder 3–5 minutes ahead; close tab; confirm delivery.
- Complete a reminder before its due time; confirm no push is sent that local day.
- Test duplicate cron invocation, stale subscriptions, offline devices, and retries.
- Verify V1 tests/build, then merge the feature branch and deploy Cloudflare Pages.

## Operational limits

The service worker and Cloudflare Worker are designed for **personal-use scale**. The Worker sends at most **5 delivery attempts per minute** because the Free plan has a **10 ms CPU-time limit per Cron invocation**. If many notifications become due simultaneously, some may arrive later. A browser/OS may also delay or suppress push delivery. Worker secrets are never committed to Git.

## External references

- https://www.rfc-editor.org/rfc/rfc8291 (message encryption)
- https://www.rfc-editor.org/rfc/rfc8292 (VAPID)
- https://developers.cloudflare.com/workers/platform/limits/
- https://supabase.com/docs/guides/database/functions
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
