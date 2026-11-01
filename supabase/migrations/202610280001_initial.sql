-- DayForge v1 · Run in Supabase SQL Editor. All user data is private by RLS.
begin;
create extension if not exists pgcrypto;

-- Validate configured timezone names in PostgreSQL as well as in the browser.
create function public.valid_iana_timezone(t text) returns boolean
language sql stable set search_path = '' as $$
  select exists(select 1 from pg_catalog.pg_timezone_names where name=t)
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Explorer' check (char_length(display_name) between 1 and 80),
  timezone text not null default 'Asia/Jakarta' check (char_length(timezone) between 1 and 80 and public.valid_iana_timezone(timezone)),
  theme text not null default 'dark' check (theme in ('dark','light')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50), color text not null default '#9981ff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id, name),unique(id,user_id)
);
create table public.goals (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 1 and 180),description text not null default '' check(char_length(description)<=5000),
  metric_type text not null check(metric_type in ('numeric','milestone')),
  target_value numeric(14,3) check (target_value > 0 and target_value <= 100000000000),
  initial_value numeric(14,3) not null default 0,
  target_date date,status text not null default 'in_progress' check(status in ('not_started','in_progress','completed','paused')),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  constraint goal_metric_values check ((metric_type='numeric' and target_value is not null) or (metric_type='milestone' and target_value is null)),
  unique(id,user_id)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 1 and 200),description text not null default '' check(char_length(description)<=5000),
  priority text not null default 'medium' check(priority in ('low','medium','high')),
  scheduled_date date not null, due_date date,category_id uuid,goal_id uuid,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(id,user_id),
  foreign key(category_id,user_id) references public.categories(id,user_id),
  foreign key(goal_id,user_id) references public.goals(id,user_id)
);
create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  task_id uuid not null,frequency text not null check(frequency in ('daily','weekly','monthly')),
  interval_count integer not null default 1 check(interval_count between 1 and 52),
  weekdays integer[] not null default '{}'::integer[] check(weekdays <@ array[1,2,3,4,5,6,7]::integer[]),
  starts_on date not null,ends_on date, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(task_id),foreign key(task_id,user_id) references public.tasks(id,user_id) on delete cascade,
  check(ends_on is null or ends_on >= starts_on)
);
create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  task_id uuid not null,activity_date date not null,
  status text not null default 'pending' check(status in ('pending','completed')),
  completed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(task_id,activity_date),foreign key(task_id,user_id) references public.tasks(id,user_id) on delete cascade,
  check ((status='completed' and completed_at is not null) or (status='pending' and completed_at is null))
);
create table public.habits (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 1 and 150),color text not null default '#9981ff' check(color ~ '^#[0-9A-Fa-f]{6}$'),
  start_date date not null,archived_at date,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(id,user_id),check(archived_at is null or archived_at >= start_date)
);
create table public.habit_targets (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  habit_id uuid not null,weekly_target integer not null check(weekly_target between 1 and 7),effective_from date not null,
  created_at timestamptz not null default now(), unique(habit_id,effective_from),
  foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade
);
create table public.habit_entries (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  habit_id uuid not null,activity_date date not null,completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),unique(habit_id,activity_date),
  foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade
);
create table public.milestones (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  goal_id uuid not null,title text not null check(char_length(trim(title)) between 1 and 180),
  due_date date,completed_on date,completed_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  foreign key(goal_id,user_id) references public.goals(id,user_id) on delete cascade,
  check ((completed_on is null and completed_at is null) or (completed_on is not null and completed_at is not null))
);
create table public.goal_progress_entries (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  goal_id uuid not null,delta_value numeric(14,3) not null check(delta_value<>0 and abs(delta_value)<=100000000000),
  activity_date date not null,note text not null default '' check(char_length(note)<=500),
  created_at timestamptz not null default now(),
  foreign key(goal_id,user_id) references public.goals(id,user_id) on delete cascade
);
create table public.daily_reflections (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  activity_date date not null,accomplishments text not null default '' check(char_length(accomplishments)<=10000),
  challenges text not null default '' check(char_length(challenges)<=10000),
  learnings text not null default '' check(char_length(learnings)<=10000),
  tomorrow_focus text not null default '' check(char_length(tomorrow_focus)<=10000),
  mood integer check(mood between 1 and 5),rating integer check(rating between 1 and 5),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,activity_date)
);

-- Reject habit check-ins outside the habit's active window or in the user's future.
create function public.validate_habit_entry_date() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare active_from date; archived date; tz text;
begin
  select h.start_date,h.archived_at,p.timezone into active_from,archived,tz
  from public.habits h join public.profiles p on p.id=h.user_id
  where h.id=new.habit_id and h.user_id=new.user_id;
  if active_from is null or new.activity_date < active_from
     or (archived is not null and new.activity_date >= archived)
     or new.activity_date > (now() at time zone tz)::date then
    raise exception 'Habit check-in date outside active window';
  end if;
  return new;
end $$;
create trigger validate_habit_entry before insert or update
on public.habit_entries for each row execute function public.validate_habit_entry_date();

create index tasks_user_schedule on public.tasks(user_id,scheduled_date);
create index task_occurrences_user_date on public.task_occurrences(user_id,activity_date);
create index task_occurrences_user_status on public.task_occurrences(user_id,status);
create index habit_entries_user_date on public.habit_entries(user_id,activity_date);
create index habit_entries_habit_date on public.habit_entries(habit_id,activity_date);
create index habit_targets_habit_date on public.habit_targets(habit_id,effective_from desc);
create index goals_user_status on public.goals(user_id,status);
create index milestones_goal_date on public.milestones(goal_id,due_date);
create index goal_progress_goal_date on public.goal_progress_entries(goal_id,activity_date);
create index reflections_user_date on public.daily_reflections(user_id,activity_date desc);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
do $$ declare t text; begin
  foreach t in array array['profiles','categories','goals','tasks','recurrence_rules','task_occurrences','habits','milestones','daily_reflections'] loop
    execute format('create trigger update_timestamp before update on public.%I for each row execute function public.touch_updated_at()',t);
  end loop;
end $$;

-- Create profile immediately when Supabase Auth creates an account.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name,timezone,theme)
  values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'user_name',''),'Explorer'),80),'Asia/Jakarta','dark');
  return new;
end $$;
create trigger auth_new_user_profile after insert on auth.users for each row execute function public.handle_new_user();

-- Authenticated, bounded, idempotent recurrence expansion. Called before reading a date range.
create function public.ensure_task_occurrences(p_start date,p_end date) returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer; extras integer;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 370 then
    raise exception 'Invalid date range: at most 371 calendar days';
  end if;
  with inserted as (
    insert into public.task_occurrences(user_id,task_id,activity_date)
    select t.user_id,t.id,d.day::date
    from public.tasks t
    join public.recurrence_rules r on r.task_id=t.id and r.user_id=t.user_id
    cross join lateral generate_series(greatest(p_start,r.starts_on)::timestamp,
      least(p_end,coalesce(r.ends_on,p_end))::timestamp,interval '1 day') as d(day)
    where t.user_id=auth.uid() and d.day::date>=r.starts_on
    and (
      (r.frequency='daily' and ((d.day::date-r.starts_on) % r.interval_count)=0)
      or
      (r.frequency='weekly' and extract(isodow from d.day)::int=any(r.weekdays)
       and ( ((date_trunc('week',d.day)::date - date_trunc('week',r.starts_on::timestamp)::date)/7) % r.interval_count)=0)
      or
      (r.frequency='monthly' and
       (((extract(year from d.day)::int-extract(year from r.starts_on)::int)*12
          +extract(month from d.day)::int-extract(month from r.starts_on)::int) % r.interval_count)=0
       and extract(day from d.day)::int=least(extract(day from r.starts_on)::int,
         extract(day from (date_trunc('month',d.day)+interval '1 month - 1 day'))::int))
    )
    on conflict(task_id,activity_date) do nothing
    returning 1
  ) select count(*) into n from inserted;
  -- One-off tasks are materialized separately: no accidental extra instance when a recurring
  -- task starts on a weekday not included in its recurrence rule.
  insert into public.task_occurrences(user_id,task_id,activity_date)
  select t.user_id,t.id,t.scheduled_date from public.tasks t
  where t.user_id=auth.uid() and t.scheduled_date between p_start and p_end
    and not exists(select 1 from public.recurrence_rules r where r.task_id=t.id)
  on conflict(task_id,activity_date) do nothing;
  get diagnostics extras = row_count;
  return n+extras;
end $$;

-- No arbitrary function invocation allowed anonymously.
revoke all on function public.ensure_task_occurrences(date,date) from public,anon;
grant execute on function public.ensure_task_occurrences(date,date) to authenticated;

-- Every personal table (including child tables) is isolated from other accounts.
do $$ declare t text; c text; begin
  foreach t in array array['profiles','categories','tasks','recurrence_rules','task_occurrences','habits','habit_targets','habit_entries','goals','milestones','goal_progress_entries','daily_reflections'] loop
    execute format('alter table public.%I enable row level security',t);
    c := case when t='profiles' then 'id' else 'user_id' end;
    execute format('create policy %I on public.%I for select to authenticated using (%I=auth.uid())',t||'_read',t,c);
    execute format('create policy %I on public.%I for insert to authenticated with check (%I=auth.uid())',t||'_insert',t,c);
    execute format('create policy %I on public.%I for update to authenticated using (%I=auth.uid()) with check (%I=auth.uid())',t||'_update',t,c,c);
    execute format('create policy %I on public.%I for delete to authenticated using (%I=auth.uid())',t||'_delete',t,c);
  end loop;
end $$;
commit;
