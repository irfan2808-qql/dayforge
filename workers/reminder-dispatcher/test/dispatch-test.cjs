const assert = require('node:assert/strict');
const {runScheduler} = require(process.argv[2]);
const originalFetch = globalThis.fetch;
const calls = [];
let claimed = false;
globalThis.fetch = async (url, options) => {
 const action = String(url).split('/').pop();
 const input = JSON.parse(options.body);
 calls.push({action,input,headers:options.headers});
 if (action==='df_enqueue_due_reminders') return new Response('1',{status:200,headers:{'content-type':'application/json'}});
 if (action==='df_claim_push_deliveries') {
  const records = claimed ? [] : [{delivery_id:'00000000-0000-4000-8000-000000000002',
   endpoint:'https://localhost.attacker.invalid/send',p256dh:'none',auth_secret:'none',
   title:'Safe title',body:'Safe message',reminder_id:'00000000-0000-4000-8000-000000000003',attempts:1}];
  claimed=true;
  return new Response(JSON.stringify(records),{status:200,headers:{'content-type':'application/json'}});
 }
 if (action==='df_finish_push_delivery') return new Response('null',{status:200,headers:{'content-type':'application/json'}});
 throw new Error('Unexpected request: '+url);
};
(async()=>{
 try {
  const result = await runScheduler({SUPABASE_URL:'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'test-only',
    VAPID_PUBLIC_KEY:'unused',VAPID_PRIVATE_KEY:'unused',VAPID_SUBJECT:'mailto:tester@example.org'});
  assert.deepEqual(result,{enqueued:1,dispatched:1});
  assert.equal(calls.length,3);
  assert.equal(calls[2].action,'df_finish_push_delivery');
  assert.equal(calls[2].input.p_status,'failed');
  assert.match(calls[2].input.p_error,/Untrusted push service/);
  assert.equal(calls[0].headers.Authorization,'Bearer test-only');
  console.log('PASS: Cron→Supabase RPC→delivery finalization; unsafe endpoint blocked');
 } finally {globalThis.fetch=originalFetch;}
})().catch(e=>{console.error(e);process.exit(1)});
