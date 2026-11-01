// Supabase Edge Function. SUPABASE_SERVICE_ROLE_KEY is an Edge Function secret ONLY.
import { createClient } from 'npm:@supabase/supabase-js@2'
Deno.serve(async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  if (req.method === 'OPTIONS') return new Response(null, { headers })
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'POST required'}), { status:405, headers })
  try {
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!jwt) return new Response(JSON.stringify({error:'Unauthorized'}), {status:401,headers})
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{autoRefreshToken:false,persistSession:false}})
    const check = createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false}})
    const {data:{user},error} = await check.auth.getUser(jwt)
    if (error || !user) return new Response(JSON.stringify({error:'Unauthorized'}),{status:401,headers})
    const body = await req.json().catch(()=>null)
    if (body?.confirmation !== 'DELETE MY ACCOUNT') return new Response(JSON.stringify({error:'Confirmation text mismatch'}),{status:400,headers})
    const result = await admin.auth.admin.deleteUser(user.id)
    if(result.error) throw result.error
    return new Response(JSON.stringify({ok:true}),{status:200,headers})
  } catch (error) {
    return new Response(JSON.stringify({error:error instanceof Error?error.message:'Internal error'}),{status:500,headers})
  }
})
