create table if not exists public.calendar_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plans jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.calendar_plans enable row level security;

revoke all on table public.calendar_plans from anon;
grant select, insert, update, delete on table public.calendar_plans to authenticated;

create policy "Users can read only their own calendar"
on public.calendar_plans
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert only their own calendar"
on public.calendar_plans
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update only their own calendar"
on public.calendar_plans
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete only their own calendar"
on public.calendar_plans
for delete
to authenticated
using ((select auth.uid()) = user_id);
