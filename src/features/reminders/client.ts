import type {SupabaseClient} from '@supabase/supabase-js';

export type ReminderKind = 'habit' | 'task' | 'goal' | 'daily';
export type ScheduleType = 'daily' | 'weekly' | 'once';
export interface ReminderRule {
  id: string; user_id: string; kind: ReminderKind; title: string; body: string;
  source_id: string | null; schedule_type: ScheduleType; local_time: string;
  timezone: string; weekdays: number[]; once_date: string | null;
  next_fire_at: string | null; active: boolean;
}
export interface NewReminder {
  kind: ReminderKind; title: string; body?: string; source_id?: string | null;
  schedule_type: ScheduleType; local_time: string; timezone: string;
  weekdays?: number[]; once_date?: string | null;
}

function b64toBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length/4)*4, '='));
  const result = Uint8Array.from(binary, x => x.charCodeAt(0));
  return result.buffer as ArrayBuffer;
}
function detectName() {
  return `${navigator.platform || 'Device'} / ${navigator.userAgent.includes('Firefox') ? 'Firefox' :
    navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') ? 'Safari' : 'Browser'}`.slice(0,80);
}
async function currentUser(supabase: SupabaseClient): Promise<string> {
  const {data, error} = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Login ke DayForge dulu untuk mengatur reminder.');
  return data.user.id;
}

/** Register a dedicated root SW only when no conflicting root service worker exists. */
export async function getPushRegistration(allowExistingServiceWorker = false): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Browser ini tidak mendukung Web Push.');
  }
  let registration = await navigator.serviceWorker.getRegistration('/');
  if (registration) {
    const script = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL || '';
    if (!script.includes('/dayforge-push-sw.js') && !allowExistingServiceWorker) {
      throw new Error('DayForge sudah menggunakan service worker lain. Integrasikan handler push ke worker tersebut sebelum mengaktifkan notifikasi.');
    }
  } else {
    registration = await navigator.serviceWorker.register('/dayforge-push-sw.js', {scope:'/'});
  }
  await navigator.serviceWorker.ready;
  return registration;
}

export async function enableDayForgePush(supabase: SupabaseClient, vapidPublicKey: string, allowExistingServiceWorker = false) {
  // Ask permission immediately from the click gesture (important on mobile).
  if (typeof Notification === 'undefined') throw new Error('Notifikasi tidak didukung browser ini.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi belum diberikan di browser.');
  const userId = await currentUser(supabase);
  const registration = await getPushRegistration(allowExistingServiceWorker);
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64toBuffer(vapidPublicKey)});
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Subscription dari browser tidak lengkap.');
  const {error} = await supabase.from('df_push_subscriptions').upsert({
    user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh,
    auth_secret: json.keys.auth, device_name: detectName()
  }, {onConflict: 'endpoint'});
  if (error) throw error;
  return subscription;
}

export async function disableDayForgePush(supabase: SupabaseClient, allowExistingServiceWorker = false) {
  const userId = await currentUser(supabase);
  const registration = await getPushRegistration(allowExistingServiceWorker);
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const {error} = await supabase.from('df_push_subscriptions')
    .delete().eq('user_id', userId).eq('endpoint', subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
}

/** Tests OS permissions and SW handling; does not test server-side delivery. */
export async function showLocalTestNotification(allowExistingServiceWorker = false) {
  if (Notification.permission !== 'granted') throw new Error('Aktifkan izin notifikasi terlebih dahulu.');
  const registration = await getPushRegistration(allowExistingServiceWorker);
  await registration.showNotification('DayForge • Tes Notifikasi', {
    body: 'Kalau pesan ini muncul, izin notifikasi dan service worker bekerja.',
    icon: '/dayforge-notification-icon.svg', tag: `df-local-test-${Date.now()}`
  });
}

export async function listReminders(supabase: SupabaseClient): Promise<ReminderRule[]> {
  await currentUser(supabase);
  const {data,error} = await supabase.from('df_reminder_rules').select('*').order('created_at', {ascending: false});
  if (error) throw error;
  return (data ?? []) as ReminderRule[];
}
export async function addReminder(supabase: SupabaseClient, form: NewReminder) {
  const userId = await currentUser(supabase);
  const {error} = await supabase.from('df_reminder_rules').insert({
    user_id:userId,kind:form.kind,title:form.title.trim(),body:form.body?.trim() || '',
    source_id:form.source_id ?? null,schedule_type:form.schedule_type,
    local_time:form.local_time,timezone:form.timezone,
    weekdays:form.schedule_type==='weekly' ? form.weekdays ?? [] : [],
    once_date:form.schedule_type==='once' ? form.once_date : null
  });
  if (error) throw error;
}
export async function setReminderActive(supabase: SupabaseClient, id: string, active: boolean) {
  const {error} = await supabase.from('df_reminder_rules').update({active}).eq('id',id);
  if (error) throw error;
}
export async function removeReminder(supabase: SupabaseClient, id: string) {
  const {error} = await supabase.from('df_reminder_rules').delete().eq('id',id);
  if (error) throw error;
}

/** Hook to existing habit completion events; the server suppresses that day's reminders. */
export async function markReminderDoneForDate(supabase: SupabaseClient, reminderId: string, isoLocalDate: string) {
  const userId = await currentUser(supabase);
  const {error} = await supabase.from('df_reminder_completions').insert({
    reminder_id:reminderId,user_id:userId,completed_on:isoLocalDate
  });
  if (error && error.code !== '23505') throw error;
}
/** Re-open an edited or previously completed habit day. */
export async function unmarkReminderDoneForDate(supabase: SupabaseClient, reminderId: string, isoLocalDate: string) {
  const {error} = await supabase.from('df_reminder_completions')
    .delete().eq('reminder_id',reminderId).eq('completed_on',isoLocalDate);
  if (error) throw error;
}
/** For one-off tasks/goals, turn off future notifications when completed. */
export async function stopRemindersForSource(supabase: SupabaseClient, kind: 'task' | 'goal', sourceId: string) {
  const {error} = await supabase.from('df_reminder_rules').update({active:false})
    .eq('kind',kind).eq('source_id',sourceId);
  if (error) throw error;
}
