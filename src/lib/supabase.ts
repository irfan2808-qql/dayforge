import {createClient, type SupabaseClient} from '@supabase/supabase-js'
import {addMonths,localDate,shiftDays} from './dates'
import type {Workspace,Profile} from './types'
export const configured=Boolean(import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY&&!import.meta.env.VITE_SUPABASE_URL.includes('YOUR_PROJECT'))
export const supabase:SupabaseClient|null=configured?createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null
export function client():SupabaseClient{if(!supabase)throw new Error('Supabase is not configured. See README.md.');return supabase}
export async function rows<T>(table:string):Promise<T[]>{const {data,error}=await client().from(table).select('*');if(error)throw error;return (data??[]) as T[]}
export async function rowMutation(table:string,kind:'insert'|'update'|'delete',payload:Record<string,unknown>,id?:string):Promise<void>{
  const q=client().from(table)
  const result=kind==='insert'?await q.insert(payload):kind==='update'?await q.update(payload).eq('id',id!):await q.delete().eq('id',id!)
  if(result.error)throw result.error
}
export async function materialize(from:string,to:string){
  let cursor=from,rounds=0
  while(cursor<=to&&rounds++<80){const end=shiftDays(cursor,Math.min(360,Math.round((new Date(to).getTime()-new Date(cursor).getTime())/86400000)))
    const {error}=await client().rpc('ensure_task_occurrences',{p_start:cursor,p_end:end})
    if(error)throw error;cursor=shiftDays(end,1)
  }
}
export async function loadWorkspace(userId:string):Promise<Workspace>{
  const profileData=await client().from('profiles').select('*').eq('id',userId).single()
  if(profileData.error)throw profileData.error
  const profile=profileData.data as Profile
  const today=localDate(profile.timezone)
  // Expand recurrence ahead and for the past year. Older calendar ranges load on demand.
  await materialize(addMonths(today,-12),addMonths(today,7))
  const tables=['categories','tasks','recurrence_rules','task_occurrences','habits','habit_targets','habit_entries','goals','milestones','goal_progress_entries','daily_reflections'] as const
  const data=await Promise.all(tables.map(async name=>{const {data,error}=await client().from(name).select('*');if(error)throw error;return [name,data??[]] as const}))
  return {profile,...Object.fromEntries(data)} as Workspace
}
