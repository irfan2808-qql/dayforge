-- DayForge V2: additive SQL migration. Does not modify existing V1 tables.
create table public.df_reminder_rules (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('habit','task','goal','daily')),
 title text not null check(length(title) between 1 and 120),
 body text not null default '' check(length(body) <= 240),
 source_id uuid,
 schedule_type text not null check(schedule_type in ('daily','weekly','once')),
 local_time time not null,
 timezone text not null default 'Asia/Jakarta',
 weekdays smallint[] not null default '{}', -- ISO day: Monday=1, Sunday=7
 once_date date,
 next_fire_at timestamptz,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id),
 constraint df_schedule_check check(
   (schedule_type='daily' and cardinality(weekdays)=0 and once_date is null)
   or (schedule_type='weekly' and cardinality(weekdays) between 1 and 7 and once_date is null)
   or (schedule_type='once' and cardinality(weekdays)=0 and once_date is not null)),
 constraint df_weekdays_check check(weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
);
create index df_rules_due on public.df_reminder_rules(next_fire_at) where active and next_fire_at is not null;
create index df_rules_owner on public.df_reminder_rules(user_id,created_at desc);
create index df_rules_source on public.df_reminder_rules(user_id,kind,source_id) where source_id is not null;

create table public.df_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint) between 10 and 2048),
 p256dh text not null check(length(p256dh) between 40 and 300),
 auth_secret text not null check(length(auth_secret) between 10 and 100),
 device_name text not null default 'Browser' check(length(device_name)<=80),
 created_at timestamptz not null default now()
);
create index df_subs_owner on public.df_push_subscriptions(user_id);

create table public.df_reminder_completions (
 reminder_id uuid not null,
 user_id uuid not null,
 completed_on date not null,
 created_at timestamptz not null default now(),
 primary key(reminder_id,completed_on),
 foreign key(reminder_id,user_id) references public.df_reminder_rules(id,user_id) on delete cascade
);
create index df_done_owner on public.df_reminder_completions(user_id,completed_on);

create table public.df_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 reminder_id uuid not null references public.df_reminder_rules(id) on delete cascade,
 subscription_id uuid not null references public.df_push_subscriptions(id) on delete cascade,
 scheduled_for timestamptz not null,
 status text not null default 'queued' check(status in ('queued','sending','retry','sent','expired','failed')),
 attempts int not null default 0 check(attempts between 0 and 20),
 next_attempt_at timestamptz not null default now(),
 claimed_at timestamptz,
 sent_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 unique(reminder_id,subscription_id,scheduled_for)
);
create index df_deliveries_pending on public.df_push_deliveries(next_attempt_at,claimed_at)
 where status in ('queued','retry','sending');

-- Compute the next future occurrence in the selected IANA timezone.
create function public.df_next_fire_at(p_kind text,p_time time,p_tz text,p_days smallint[],p_date date,p_after timestamptz)
returns timestamptz language plpgsql stable security invoker set search_path='' as $$
declare local_day date; d date; result timestamptz; i int;
begin
 if p_kind='once' then
   result := (p_date+p_time) at time zone p_tz;
   if result>p_after then return result; end if;
   return null;
 end if;
 local_day := (p_after at time zone p_tz)::date;
 for i in 0..8 loop
   d := local_day+i;
   if p_kind='daily' or (p_kind='weekly' and extract(isodow from d)::smallint=any(p_days)) then
     result := (d+p_time) at time zone p_tz;
     if result>p_after then return result; end if;
   end if;
 end loop;
 return null;
end; $$;

create function public.df_set_reminder_schedule() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
  raise exception 'Invalid timezone';
 end if;
 if tg_op='INSERT' then
  new.next_fire_at:=public.df_next_fire_at(new.schedule_type,new.local_time,new.timezone,new.weekdays,new.once_date,now());
 elsif (new.schedule_type,new.local_time,new.timezone,new.weekdays,new.once_date)
       is distinct from (old.schedule_type,old.local_time,old.timezone,old.weekdays,old.once_date) then
  new.next_fire_at:=public.df_next_fire_at(new.schedule_type,new.local_time,new.timezone,new.weekdays,new.once_date,now());
 end if;
 new.updated_at:=now();
 return new;
end; $$;
create trigger df_rule_schedule before insert or update on public.df_reminder_rules
for each row execute function public.df_set_reminder_schedule();

alter table public.df_reminder_rules enable row level security;
alter table public.df_push_subscriptions enable row level security;
alter table public.df_reminder_completions enable row level security;
alter table public.df_push_deliveries enable row level security;

create policy df_rules_read on public.df_reminder_rules for select to authenticated using((select auth.uid())=user_id);
create policy df_rules_add on public.df_reminder_rules for insert to authenticated with check((select auth.uid())=user_id);
create policy df_rules_edit on public.df_reminder_rules for update to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy df_rules_remove on public.df_reminder_rules for delete to authenticated using((select auth.uid())=user_id);
create policy df_subs_read on public.df_push_subscriptions for select to authenticated using((select auth.uid())=user_id);
create policy df_subs_add on public.df_push_subscriptions for insert to authenticated with check((select auth.uid())=user_id);
create policy df_subs_edit on public.df_push_subscriptions for update to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy df_subs_remove on public.df_push_subscriptions for delete to authenticated using((select auth.uid())=user_id);
create policy df_done_read on public.df_reminder_completions for select to authenticated using((select auth.uid())=user_id);
create policy df_done_add on public.df_reminder_completions for insert to authenticated with check((select auth.uid())=user_id);
create policy df_done_remove on public.df_reminder_completions for delete to authenticated using((select auth.uid())=user_id);
create policy df_deliveries_read on public.df_push_deliveries for select to authenticated using((select auth.uid())=user_id);

-- Only intended columns may be changed by authenticated clients.
revoke update on public.df_reminder_rules from authenticated;
grant select,insert,delete on public.df_reminder_rules to authenticated;
grant update(kind,title,body,source_id,schedule_type,local_time,timezone,weekdays,once_date,active)
 on public.df_reminder_rules to authenticated;
grant select,insert,update,delete on public.df_push_subscriptions to authenticated;
grant select,insert,delete on public.df_reminder_completions to authenticated;
revoke insert,update,delete on public.df_push_deliveries from authenticated,anon;
grant select on public.df_push_deliveries to authenticated;

-- DayForge V1 integration: check real task, habit, and goal completion BEFORE dispatch.
-- Called only from the privileged dispatcher RPCs; clients cannot query arbitrary users.
create function public.df_source_should_skip(p_kind text,p_user uuid,p_source uuid,p_day date)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
 h record;
 g record;
 target_count integer;
 week_start date;
 achieved numeric;
begin
 if p_source is null or p_kind='daily' then return false; end if;
 if p_kind='habit' then
   select start_date, archived_at into h from public.habits
     where id=p_source and user_id=p_user;
   if not found then return true; end if;
   if p_day < h.start_date or (h.archived_at is not null and p_day>=h.archived_at) then return true; end if;
   if exists(select 1 from public.habit_entries
     where user_id=p_user and habit_id=p_source and activity_date=p_day) then return true; end if;
   select weekly_target into target_count from public.habit_targets
     where user_id=p_user and habit_id=p_source and effective_from<=p_day
     order by effective_from desc limit 1;
   if target_count is not null then
     week_start:=date_trunc('week',p_day::timestamp)::date;
     if (select count(*) from public.habit_entries
       where user_id=p_user and habit_id=p_source
         and activity_date between week_start and week_start+6)>=target_count then return true; end if;
   end if;
   return false;
 elsif p_kind='task' then
   if not exists(select 1 from public.tasks where user_id=p_user and id=p_source) then return true; end if;
   if exists(select 1 from public.recurrence_rules where user_id=p_user and task_id=p_source) then
     return exists(select 1 from public.task_occurrences
       where user_id=p_user and task_id=p_source and activity_date=p_day and status='completed');
   end if;
   return exists(select 1 from public.task_occurrences
     where user_id=p_user and task_id=p_source and status='completed');
 elsif p_kind='goal' then
   select status,metric_type,target_value,initial_value into g from public.goals
     where id=p_source and user_id=p_user;
   if not found then return true; end if;
   if g.status in ('completed','paused') then return true; end if;
   if g.metric_type='numeric' then
     select g.initial_value+coalesce(sum(delta_value),0) into achieved
       from public.goal_progress_entries where user_id=p_user and goal_id=p_source;
     return achieved>=g.target_value;
   end if;
   if exists(select 1 from public.milestones where user_id=p_user and goal_id=p_source)
     and not exists(select 1 from public.milestones
       where user_id=p_user and goal_id=p_source and completed_at is null) then return true; end if;
   return false;
 end if;
 return false;
end; $$;
revoke all on function public.df_source_should_skip(text,uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.df_source_should_skip(text,uuid,uuid,date) to service_role;

-- Atomic scheduler/outbox function: lock each rule and advance it only once.
create function public.df_enqueue_due_reminders(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare r record; new_count int; total int:=0;
begin
 for r in select * from public.df_reminder_rules
   where active and next_fire_at <= now() order by next_fire_at
   limit least(greatest(p_limit,1),200) for update skip locked
 loop
   if r.next_fire_at > now()-interval '1 hour' and not exists(
     select 1 from public.df_reminder_completions c
     where c.reminder_id=r.id and c.completed_on=(r.next_fire_at at time zone r.timezone)::date
   ) and not public.df_source_should_skip(r.kind,r.user_id,r.source_id,(r.next_fire_at at time zone r.timezone)::date) then
     insert into public.df_push_deliveries(user_id,reminder_id,subscription_id,scheduled_for)
     select r.user_id,r.id,s.id,r.next_fire_at from public.df_push_subscriptions s
     where s.user_id=r.user_id
     on conflict(reminder_id,subscription_id,scheduled_for) do nothing;
     get diagnostics new_count=row_count;
     total:=total+new_count;
   end if;
   update public.df_reminder_rules set
     next_fire_at=public.df_next_fire_at(r.schedule_type,r.local_time,r.timezone,r.weekdays,r.once_date,now()),
     active=case when r.schedule_type='once' then false else r.active end
   where id=r.id;
 end loop;
 return total;
end; $$;

-- Lease pending deliveries. A crashed Worker is retried after 5 minutes.
create function public.df_claim_push_deliveries(p_limit integer default 50)
returns table(delivery_id uuid,endpoint text,p256dh text,auth_secret text,
 title text,body text,reminder_id uuid,attempts integer)
language plpgsql security definer set search_path='' as $$
begin
 -- A user may complete an activity AFTER enqueue but BEFORE the Worker sends it.
 update public.df_push_deliveries d
 set status='failed',last_error='Completed before dispatch'
 from public.df_reminder_rules r
 where d.reminder_id=r.id and d.status in ('queued','retry')
 and (exists(select 1 from public.df_reminder_completions c
   where c.reminder_id=r.id and c.completed_on=(d.scheduled_for at time zone r.timezone)::date)
   or public.df_source_should_skip(r.kind,r.user_id,r.source_id,(d.scheduled_for at time zone r.timezone)::date));
 return query
 with chosen as (
   select d.id from public.df_push_deliveries d
   where (d.status in ('queued','retry') and d.next_attempt_at<=now())
     or (d.status='sending' and d.claimed_at<=now()-interval '5 minutes')
   order by d.created_at limit least(greatest(p_limit,1),100) for update skip locked
 ), claimed as (
   update public.df_push_deliveries d set status='sending',claimed_at=now(),attempts=d.attempts+1
   from chosen where d.id=chosen.id
   returning d.id,d.subscription_id,d.reminder_id,d.attempts
 )
 select c.id,s.endpoint,s.p256dh,s.auth_secret,r.title,r.body,r.id,c.attempts
 from claimed c
 join public.df_push_subscriptions s on s.id=c.subscription_id
 join public.df_reminder_rules r on r.id=c.reminder_id;
end; $$;

create function public.df_finish_push_delivery(p_id uuid,p_status text,p_error text default null,p_retry_seconds integer default 60)
returns void language plpgsql security definer set search_path='' as $$
declare sub_id uuid;
begin
 if p_status not in ('sent','retry','expired','failed') then raise exception 'Invalid status'; end if;
 update public.df_push_deliveries set
   status=p_status,last_error=left(p_error,500),claimed_at=null,
   sent_at=case when p_status='sent' then now() else sent_at end,
   next_attempt_at=case when p_status='retry'
      then now()+make_interval(secs=>least(greatest(p_retry_seconds,10),3600))
      else next_attempt_at end
 where id=p_id returning subscription_id into sub_id;
 if p_status='expired' and sub_id is not null then
   delete from public.df_push_subscriptions where id=sub_id;
 end if;
end; $$;

-- CRITICAL: SECURITY DEFINER functions cannot be invoked by the client.
revoke all on function public.df_enqueue_due_reminders(integer) from public,anon,authenticated;
revoke all on function public.df_claim_push_deliveries(integer) from public,anon,authenticated;
revoke all on function public.df_finish_push_delivery(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.df_enqueue_due_reminders(integer) to service_role;
grant execute on function public.df_claim_push_deliveries(integer) to service_role;
grant execute on function public.df_finish_push_delivery(uuid,text,text,integer) to service_role;
