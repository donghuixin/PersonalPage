-- ==========================================================================================
-- News Flight · records board (Supabase)
-- Paste all of this into Supabase › SQL Editor › New query, then press Run.
-- It is safe to run again later (everything is "if not exists" / "or replace").
--
-- How a record is made:
--   nf_start()            when the visitor starts flying   -> the server notes the start time
--   nf_complete(run)      when the last balloon pops       -> the server notes the finish time
--   nf_save(run, name)    only if the visitor types a name -> the record goes on the board
-- The time on the board is always finish - start as measured by the server, so it cannot be
-- typed in or edited from the browser. Visitors can read the board but cannot write to the
-- tables directly; the three functions above are the only way in.
--
-- Moderation: in Supabase › Table Editor › nf_records, tick "hidden" on any row to take it off
-- the board (or delete the row).
-- ==========================================================================================

create table if not exists public.nf_runs (
  id           uuid primary key default gen_random_uuid(),
  ip           text,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  saved        boolean not null default false
);
create index if not exists nf_runs_ip_started on public.nf_runs (ip, started_at);

create table if not exists public.nf_records (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 24),
  ms         integer not null check (ms > 0),
  created_at timestamptz not null default now(),
  hidden     boolean not null default false
);
create index if not exists nf_records_ms on public.nf_records (ms) where not hidden;

-- Row level security: the board is readable by everyone, nothing is writable directly.
alter table public.nf_runs enable row level security;
alter table public.nf_records enable row level security;
drop policy if exists "records are public" on public.nf_records;
create policy "records are public" on public.nf_records
  for select to anon, authenticated using (not hidden);
grant select (name, ms, created_at) on public.nf_records to anon, authenticated;
revoke insert, update, delete, truncate on public.nf_records from anon, authenticated;
revoke all on public.nf_runs from anon, authenticated;

-- The visitor's IP, as forwarded by Supabase's API gateway (used only to throttle abuse).
create or replace function public.nf_client_ip() returns text
language sql stable as $$
  select nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '')
$$;

create or replace function public.nf_start() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.nf_client_ip();
  v_id uuid;
begin
  if v_ip is not null and (
    select count(*) from nf_runs where ip = v_ip and started_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'Too many flights from this network, please try again later';
  end if;
  delete from nf_runs where started_at < now() - interval '2 days';   -- keep the table small
  insert into nf_runs (ip) values (v_ip) returning id into v_id;
  return v_id;
end $$;

create or replace function public.nf_complete(run uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r nf_runs;
begin
  update nf_runs set completed_at = now()
    where id = run and completed_at is null
    returning * into r;
  if r.id is null then
    raise exception 'Unknown or already finished flight';
  end if;
  return round(extract(epoch from (r.completed_at - r.started_at)) * 1000)::integer;
end $$;

create or replace function public.nf_save(run uuid, player text) returns json
language plpgsql security definer set search_path = public as $$
declare
  r      nf_runs;
  v_name text;
  v_ms   integer;
  v_rank integer;
begin
  select * into r from nf_runs where id = run for update;
  if r.id is null or r.completed_at is null then
    raise exception 'This flight was not finished';
  end if;
  if r.saved then
    raise exception 'This flight is already on the board';
  end if;
  if r.completed_at < now() - interval '1 hour' then
    raise exception 'This flight is too old to save';
  end if;
  v_ms := round(extract(epoch from (r.completed_at - r.started_at)) * 1000)::integer;
  if v_ms < 20000 then
    raise exception 'That flight was impossibly fast';
  end if;
  if v_ms > 6 * 3600 * 1000 then
    raise exception 'That flight took too long to count';
  end if;
  v_name := regexp_replace(coalesce(player, ''), '[[:cntrl:]]', '', 'g');
  v_name := btrim(regexp_replace(v_name, '\s+', ' ', 'g'));
  v_name := btrim(left(v_name, 24));
  if char_length(v_name) < 1 then
    raise exception 'Please type a name';
  end if;
  update nf_runs set saved = true where id = run;
  insert into nf_records (name, ms) values (v_name, v_ms);
  select count(*) + 1 into v_rank from nf_records where not hidden and ms < v_ms;
  return json_build_object('name', v_name, 'ms', v_ms, 'rank', v_rank);
end $$;

revoke execute on function public.nf_client_ip() from public, anon, authenticated;
revoke execute on function public.nf_start() from public;
revoke execute on function public.nf_complete(uuid) from public;
revoke execute on function public.nf_save(uuid, text) from public;
grant execute on function public.nf_start() to anon, authenticated;
grant execute on function public.nf_complete(uuid) to anon, authenticated;
grant execute on function public.nf_save(uuid, text) to anon, authenticated;
