create extension if not exists pgcrypto with schema extensions;

create table if not exists public.calendar_sync (
  id text primary key,
  write_token_hash bytea not null,
  payload text not null,
  updated_at timestamptz not null default now()
);

alter table public.calendar_sync enable row level security;
revoke all on table public.calendar_sync from anon, authenticated;

create or replace function public.read_calendar(p_id text)
returns table(payload text, updated_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select calendar_sync.payload, calendar_sync.updated_at
  from public.calendar_sync
  where calendar_sync.id = p_id
  limit 1;
$$;

create or replace function public.write_calendar(
  p_id text,
  p_write_token text,
  p_payload text,
  p_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  insert into public.calendar_sync (id, write_token_hash, payload, updated_at)
  values (
    p_id,
    extensions.digest(p_write_token, 'sha256'),
    p_payload,
    p_updated_at
  )
  on conflict (id) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at
  where public.calendar_sync.write_token_hash =
        extensions.digest(p_write_token, 'sha256');

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public.delete_calendar(
  p_id text,
  p_write_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  delete from public.calendar_sync
  where id = p_id
    and write_token_hash = extensions.digest(p_write_token, 'sha256');

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.read_calendar(text) from public;
revoke all on function public.write_calendar(text, text, text, timestamptz) from public;
revoke all on function public.delete_calendar(text, text) from public;

grant execute on function public.read_calendar(text) to anon;
grant execute on function public.write_calendar(text, text, text, timestamptz) to anon;
grant execute on function public.delete_calendar(text, text) to anon;
