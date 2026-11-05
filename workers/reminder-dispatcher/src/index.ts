import {sendWebPush} from './webpush';

export interface Env {
 SUPABASE_URL: string;
 SUPABASE_SERVICE_ROLE_KEY: string;
 VAPID_PUBLIC_KEY: string;
 VAPID_PRIVATE_KEY: string;
 VAPID_SUBJECT: string;
}
interface Delivery {
 delivery_id: string; endpoint: string; p256dh: string; auth_secret: string;
 title: string; body: string; reminder_id: string; attempts: number;
}

async function rpc<T>(env: Env, name: string, args: object): Promise<T> {
 const endpoint = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`;
 const response = await fetch(endpoint, {
   method: 'POST',
   headers: {'content-type':'application/json', 'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
     'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`},
   body: JSON.stringify(args),
 });
 if (!response.ok) throw new Error(`${name}: ${response.status} ${String(await response.text()).slice(0, 240)}`);
 return response.json() as Promise<T>;
}

async function dispatchOne(env: Env, d: Delivery): Promise<void> {
 let status = 'failed';
 let error: string | null = null;
 let retrySeconds = 60;
 try {
   const resp = await sendWebPush({
     endpoint: d.endpoint, p256dh: d.p256dh, auth_secret: d.auth_secret,
     payload: JSON.stringify({title: d.title, body: d.body, reminderId: d.reminder_id, deliveryId: d.delivery_id}),
     publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT
   });
   if (resp.ok) status = 'sent';
   else if (resp.status === 404 || resp.status === 410) status = 'expired';
   else if ([408,425,429,500,502,503,504].includes(resp.status) && d.attempts < 5) {
     status = 'retry'; retrySeconds = Math.min(3600, 30 * 2 ** d.attempts);
     error = `Push service HTTP ${resp.status}`;
   } else error = `Push service HTTP ${resp.status}`;
 } catch(e) {
   error = e instanceof Error ? e.message : 'Unknown web push error';
   if (d.attempts < 5 && !/Untrusted|Invalid subscription|Bad VAPID|VAPID_SUBJECT|exceeds/.test(error)) {
     status = 'retry'; retrySeconds = Math.min(3600, 30 * 2 ** d.attempts);
   }
 }
 await rpc(env, 'df_finish_push_delivery', {p_id: d.delivery_id, p_status: status, p_error: error, p_retry_seconds: retrySeconds});
}

export async function runScheduler(env: Env): Promise<{enqueued: number; dispatched: number}> {
 const enqueued = await rpc<number>(env, 'df_enqueue_due_reminders', {p_limit: 100});
 let dispatched = 0;
 // Cap at 5 deliveries per cron tick for Cloudflare Workers Free 10ms CPU budget.
 for (let page = 0; page < 1; page++) {
   const deliveries = await rpc<Delivery[]>(env, 'df_claim_push_deliveries', {p_limit: 5});
   if (!deliveries.length) break;
   for (let i = 0; i < deliveries.length; i += 5) {
     const batch = deliveries.slice(i, i + 5);
     const outcomes = await Promise.allSettled(batch.map(item => dispatchOne(env, item)));
     for (const outcome of outcomes) if (outcome.status === 'rejected') console.error('Push dispatch failed', String(outcome.reason));
   }
   dispatched += deliveries.length;
   if (deliveries.length < 5) break;
 }
 return {enqueued, dispatched};
}

export default {
 async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
   ctx.waitUntil(runScheduler(env).then(result => console.log('DayForge reminder cron', result)));
 },
 async fetch() {
   return new Response('DayForge reminder dispatcher. Only cron events can send pushes.', {status: 200});
 }
};
