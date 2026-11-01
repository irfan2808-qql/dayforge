import {z} from 'zod'
import type {Workspace} from './types'
import {client} from './supabase'
const tables=['categories','goals','habits','tasks','recurrence_rules','task_occurrences','habit_targets','habit_entries','milestones','goal_progress_entries','daily_reflections'] as const
const allowed:Record<string,string[]>={
 categories:['id','name','color'],goals:['id','title','description','metric_type','target_value','initial_value','target_date','status'],
 habits:['id','title','color','start_date','archived_at'],tasks:['id','title','description','priority','scheduled_date','due_date','category_id','goal_id'],
 recurrence_rules:['id','task_id','frequency','interval_count','weekdays','starts_on','ends_on'],task_occurrences:['id','task_id','activity_date','status','completed_at'],
 habit_targets:['id','habit_id','weekly_target','effective_from'],habit_entries:['id','habit_id','activity_date','completed_at'],
 milestones:['id','goal_id','title','due_date','completed_on','completed_at'],goal_progress_entries:['id','goal_id','delta_value','activity_date','note'],
 daily_reflections:['id','activity_date','accomplishments','challenges','learnings','tomorrow_focus','mood','rating']
}
const entity=z.object({id:z.string().uuid()}).passthrough()
const objectShape=Object.fromEntries(tables.map(t=>[t,z.array(entity).max(100000)])) as Record<(typeof tables)[number],z.ZodArray<typeof entity>>
const schema=z.object({format:z.literal('dayforge-backup'),version:z.literal(1),exported_at:z.string().optional(),profile:z.object({display_name:z.string().max(80),timezone:z.string().max(80),theme:z.enum(['light','dark'])}).optional(),data:z.object(objectShape).strict()}).strict()
export function exportJSON(w:Workspace){return JSON.stringify({format:'dayforge-backup',version:1,exported_at:new Date().toISOString(),profile:{display_name:w.profile.display_name,timezone:w.profile.timezone,theme:w.profile.theme},data:Object.fromEntries(tables.map(t=>[t,w[t]]))},null,2)}
export function exportCSV(w:Workspace){
 const esc=(x:unknown)=>`"${String(x??'').replaceAll('"','""')}"`
 return [['table','id','record_json'].map(esc).join(','),...tables.flatMap(table=>(w[table] as unknown as Record<string,unknown>[]).map(record=>[table,record.id,JSON.stringify(record)].map(esc).join(',')))].join('\r\n')
}
export function download(content:string,name:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
export async function importJSON(json:string,userId:string){
  const parsed=schema.parse(JSON.parse(json));const records=parsed.data
  const all=new Set<string>();for(const name of tables)for(const record of records[name]){if(all.has(record.id))throw Error('Duplicate record ID: '+record.id);all.add(record.id)}
  for(const name of tables)for(const record of records[name]){
    for(const field of ['task_id','habit_id','goal_id','category_id']){const val=record[field];if(typeof val==='string'&&!all.has(val))throw Error(`Missing reference ${field}: ${val}`)}
    for(const key of Object.keys(record)){if(!allowed[name].includes(key)&&!['created_at','updated_at','user_id'].includes(key))throw Error(`Unrecognized ${name} field: ${key}`)}
  }
  // Non-transactional multi-request upserts. All values validated again by PostgreSQL constraints and RLS.
  let imported=0
  for(const table of tables){
    const values=records[table].map(r=>({...Object.fromEntries(Object.entries(r).filter(([key])=>allowed[table].includes(key))),user_id:userId}))
    for(let i=0;i<values.length;i+=200){const count=values.slice(i,i+200);const {error}=await client().from(table).upsert(count,{onConflict:'id'});if(error)throw Error(`${table}: ${error.message}. ${imported} records imported before failure.`);imported+=count.length}
  }
  if(parsed.profile){const {error}=await client().from('profiles').update(parsed.profile).eq('id',userId);if(error)throw error}
  return imported
}
