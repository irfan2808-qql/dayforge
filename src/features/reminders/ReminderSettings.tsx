import {useCallback, useEffect, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Workspace} from '../../lib/types';
import {
  addReminder, disableDayForgePush, enableDayForgePush, listReminders,
  removeReminder, setReminderActive, showLocalTestNotification, markReminderDoneForDate,
  type ReminderKind, type ReminderRule, type ScheduleType
} from './client';

const weekdayNames = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as Navigator & {standalone?:boolean}).standalone === true);
function todayString(timeZone?: string) {
  const now = new Date();
  const p = new Intl.DateTimeFormat('en-US', {year:'numeric',month:'2-digit',day:'2-digit', ...(timeZone ? {timeZone} : {})}).formatToParts(now);
  const get = (type: string) => p.find(x => x.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export interface ReminderSettingsProps {
  supabase: SupabaseClient;
  vapidPublicKey: string;
  /** Existing DayForge V1 workspace; activates activity linking. */
  workspace?: Workspace;
  /** Set true ONLY after including push listeners in the existing PWA worker. */
  allowExistingServiceWorker?: boolean;
}

/** DayForge V2 settings. Requires authenticated Supabase client from V1. */
export function ReminderSettings({supabase,vapidPublicKey,workspace,allowExistingServiceWorker=false}: ReminderSettingsProps) {
  const [items,setItems] = useState<ReminderRule[]>([]);
  const [kind,setKind] = useState<ReminderKind>('habit');
  const [title,setTitle] = useState('');
  const [sourceId,setSourceId] = useState('');
  const [message,setMessage] = useState('');
  const [schedule,setSchedule] = useState<ScheduleType>('daily');
  const [time,setTime] = useState('07:00');
  const [date,setDate] = useState(todayString);
  const [days,setDays] = useState<number[]>([1,2,3,4,5]);
  const [timezone,setTimezone] = useState(() => workspace?.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta');
  const sources = kind === 'habit' ? (workspace?.habits ?? []).filter(x => !x.archived_at) : kind === 'task' ? (workspace?.tasks ?? []) : kind === 'goal' ? (workspace?.goals ?? []).filter(x => x.status !== 'completed') : [];
  const sourceLabel = sources.find(x => x.id === sourceId)?.title;
  const [permission,setPermission] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [info,setInfo] = useState('');
  const [completedIds,setCompletedIds] = useState<string[]>([]);

  const refresh = useCallback(async () => setItems(await listReminders(supabase)),[supabase]);
  useEffect(() => { void refresh().catch(e => setError(String(e instanceof Error ? e.message : e))); },[refresh]);
  async function perform(action: () => Promise<void>, successMessage: string) {
    setBusy(true); setError(''); setInfo('');
    try { await action(); await refresh(); setInfo(successMessage); }
    catch(e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function toggleDay(day: number) { setDays(v => v.includes(day) ? v.filter(x=>x!==day) : [...v,day].sort()); }
  const control = 'field w-full';
  const button = 'btn-primary disabled:opacity-50';

  return (
    <section className="w-full space-y-5 text-ink" aria-label="DayForge Push Notifications">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold">Pengingat DayForge</h2>
        <p className="text-sm text-muted">Notifikasi habit, task, dan goal ke HP atau laptop.</p>
      </header>
      {isIOS() && !standalone() && <p className="rounded-lg border border-amber-600 p-3 text-sm">Di iPhone/iPad, buka DayForge lewat Safari lalu pilih Share → Add to Home Screen. Buka ikon aplikasi dari Home Screen sebelum mengaktifkan push.</p>}
      <div className="rounded-xl border border-edge bg-surface p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-semibold">Perangkat ini</h3><p className="text-xs text-muted">Izin: {permission}</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || !vapidPublicKey}
              onClick={() => void perform(async () => {
                await enableDayForgePush(supabase,vapidPublicKey,allowExistingServiceWorker);
                setPermission(Notification.permission);
              },'Notifikasi aktif pada perangkat ini.')}>Aktifkan</button>
            <button type="button" className="rounded-lg border border-edge px-3 py-2 disabled:opacity-50" disabled={busy}
              onClick={() => void perform(async () => {await showLocalTestNotification(allowExistingServiceWorker);},'Tes lokal dikirim ke sistem notifikasi.')}>Tes lokal</button>
            <button type="button" className="rounded-lg border border-edge px-3 py-2 disabled:opacity-50" disabled={busy}
              onClick={() => void perform(async () => {await disableDayForgePush(supabase,allowExistingServiceWorker);},'Notifikasi dinonaktifkan pada perangkat ini.')}>Nonaktifkan</button>
          </div>
        </div>
        <p className="text-xs text-muted">Tes lokal hanya memeriksa izin/browser. Untuk tes push end-to-end, buat pengingat sekali pada waktu beberapa menit ke depan.</p>
      </div>
      <form className="space-y-4 rounded-xl border border-edge p-4" onSubmit={event => {
        event.preventDefault();
        if (schedule === 'weekly' && days.length === 0) {setError('Pilih minimal satu hari.');return;}
        void perform(async () => {
          await addReminder(supabase,{
            title,body:message,kind,source_id:kind !== 'daily' ? (sourceId || null) : null,schedule_type:schedule,local_time:time,
            timezone,weekdays:days,once_date:date
          }); setTitle('');setMessage('');
        },'Pengingat berhasil disimpan.');
      }}>
        <h3 className="font-semibold">Tambah pengingat</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Jenis aktivitas
            <select className={control} value={kind} onChange={e => {setKind(e.target.value as ReminderKind);setSourceId('');}}>
              <option value="habit">Habit</option><option value="task">Task</option>
              <option value="goal">Goal</option><option value="daily">Daily check-in</option>
            </select>
          </label>
          {kind !== 'daily' && workspace && <label className="space-y-1 text-sm sm:col-span-2">Hubungkan dengan aktivitas DayForge (opsional)
            <select className={control} value={sourceId} onChange={e => {const nextId=e.target.value;setSourceId(nextId);const next=sources.find(x=>x.id===nextId);if(next)setTitle(next.title);}}>
              <option value="">Pengingat umum (tanpa aktivitas tertentu)</option>
              {sources.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <span className="block text-xs text-muted">Jika dihubungkan, reminder otomatis dilewati ketika aktivitas sudah selesai. {sourceId && sourceLabel ? `Terkait: ${sourceLabel}` : ''}</span>
          </label>}
          <label className="space-y-1 text-sm">Jam
            <input className={control} type="time" required value={time} onChange={e => setTime(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">Judul
            <input className={control} maxLength={120} required placeholder="Contoh: Olahraga pagi" value={title} onChange={e => setTitle(e.target.value)}/>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">Isi notifikasi (opsional)
            <input className={control} maxLength={240} placeholder="Waktunya mulai progres!" value={message} onChange={e => setMessage(e.target.value)}/>
          </label>
          <label className="space-y-1 text-sm">Pengulangan
            <select className={control} value={schedule} onChange={e => setSchedule(e.target.value as ScheduleType)}>
              <option value="daily">Setiap hari</option><option value="weekly">Hari tertentu</option>
              <option value="once">Sekali saja</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">Timezone
            <input className={control} required value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="Asia/Jakarta"/>
          </label>
          {schedule === 'once' && <label className="space-y-1 text-sm sm:col-span-2">Tanggal
            <input className={control} type="date" required value={date} onChange={e => setDate(e.target.value)}/>
          </label>}
          {schedule === 'weekly' && <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
            <legend className="mb-1 text-sm">Hari aktif</legend>
            {weekdayNames.map((day,i) => <label className="flex items-center gap-1 text-sm" key={i}>
              <input type="checkbox" checked={days.includes(i+1)} onChange={() => toggleDay(i+1)}/>{day}
            </label>)}
          </fieldset>}
        </div>
        <button type="submit" disabled={busy || !title.trim()} className={button}>Simpan pengingat</button>
      </form>
      <section className="space-y-2">
        <h3 className="font-semibold">Pengingat tersimpan ({items.length})</h3>
        {items.length===0 && <p className="text-sm text-muted">Belum ada pengingat.</p>}
        {items.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{item.title} <span className="text-xs text-muted">({item.kind})</span></p>
            <p className="text-xs text-muted">{item.schedule_type === 'once' ? item.once_date : item.schedule_type} • {item.local_time.slice(0,5)} • {item.timezone}</p>
            <p className="text-xs text-muted">Berikutnya: {item.next_fire_at ? new Date(item.next_fire_at).toLocaleString('id-ID',{timeZone:item.timezone}) : 'Tidak ada'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {item.active && <button type="button" disabled={busy || completedIds.includes(item.id)}
              className="rounded-lg border border-accent/50 px-3 py-1 text-sm text-accent disabled:opacity-50"
              onClick={() => void perform(async () => {
                if (item.schedule_type === 'once') await setReminderActive(supabase,item.id,false);
                else await markReminderDoneForDate(supabase,item.id,todayString(item.timezone));
                setCompletedIds(prev => [...prev,item.id]);
              },'Aktivitas ditandai selesai. Pengingat berikutnya hari ini dilewati.')}>
              {completedIds.includes(item.id)?'Selesai ✓':'Selesai hari ini'}
            </button>}
            <button type="button" disabled={busy} className="rounded-lg border border-edge px-3 py-1 text-sm" onClick={() => void perform(async () => {await setReminderActive(supabase,item.id,!item.active);},item.active?'Pengingat dijeda.':'Pengingat diaktifkan.')}>{item.active?'Jeda':'Aktifkan'}</button>
            <button type="button" disabled={busy} className="rounded-lg border border-red-600 px-3 py-1 text-sm text-red-300" onClick={() => void perform(async () => {await removeReminder(supabase,item.id);},'Pengingat dihapus.')}>Hapus</button>
          </div>
        </article>)}
      </section>
      {error && <p role="alert" className="rounded-lg border border-red-700 p-3 text-sm text-red-300">{error}</p>}
      {info && <p role="status" className="rounded-lg border border-accent/50 p-3 text-sm text-accent">{info}</p>}
    </section>
  );
}
