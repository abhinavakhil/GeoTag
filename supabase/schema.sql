-- GeoTag shared backend. Run in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Roles: citizen (report), crew (mark cleaned), officer (tickets, delete, export), admin (wards, roles).

create extension if not exists postgis;

-- One profile per auth user. Default role is citizen; admins raise it from the dashboard or SQL.
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  role text not null default 'citizen' check (role in ('citizen','crew','officer','admin')),
  created_at timestamptz default now()
);
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into profiles (id, email) values (new.id, new.email) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure handle_new_user();

create or replace function my_role() returns text language sql stable security definer as $$
  select coalesce((select role from profiles where id = auth.uid()), 'anon') $$;
create or replace function role_rank(r text) returns int language sql immutable as $$
  select case r when 'admin' then 4 when 'officer' then 3 when 'crew' then 2 when 'citizen' then 1 else 0 end $$;

-- Reports. Photos stay on the reporter's device (only a small JPEG data URL is optionally stored).
create table if not exists reports (
  id text primary key,
  user_id uuid references auth.users on delete set null default auth.uid(),
  lat double precision not null, lng double precision not null,
  geom geography(point) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  category text not null, volume text not null, note text, photo text,
  items jsonb default '[]', scene jsonb, ai jsonb,
  time bigint not null, cleaned boolean default false, cleaned_at bigint, verified boolean default false,
  sightings int default 1, demo boolean default false,
  updated_at timestamptz default now()
);
create index if not exists reports_geom on reports using gist (geom);
create index if not exists reports_time on reports (time desc);

create table if not exists tickets (
  key text primary key,
  opened_at bigint, assignee text default '', due date, closed_at bigint,
  updated_at timestamptz default now()
);

create table if not exists wards (
  id int primary key default 1 check (id = 1),  -- one active boundary set per project
  geojson jsonb not null, updated_at timestamptz default now()
);

create or replace function touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists reports_touch on reports; create trigger reports_touch before update on reports for each row execute procedure touch();
drop trigger if exists tickets_touch on tickets; create trigger tickets_touch before update on tickets for each row execute procedure touch();

-- Row level security
alter table profiles enable row level security;
alter table reports  enable row level security;
alter table tickets  enable row level security;
alter table wards    enable row level security;

drop policy if exists "profiles self read"   on profiles; create policy "profiles self read"   on profiles for select using (id = auth.uid() or role_rank(my_role()) >= 3);
drop policy if exists "profiles admin write" on profiles; create policy "profiles admin write" on profiles for update using (my_role() = 'admin');

drop policy if exists "reports public read"  on reports; create policy "reports public read"  on reports for select using (true);
drop policy if exists "reports insert"       on reports; create policy "reports insert"       on reports for insert with check (auth.uid() is not null);
drop policy if exists "reports own update"   on reports; create policy "reports own update"   on reports for update using (user_id = auth.uid() or role_rank(my_role()) >= 2);
drop policy if exists "reports delete"       on reports; create policy "reports delete"       on reports for delete using (user_id = auth.uid() or role_rank(my_role()) >= 3);

drop policy if exists "tickets read"  on tickets; create policy "tickets read"  on tickets for select using (auth.uid() is not null);
drop policy if exists "tickets write" on tickets; create policy "tickets write" on tickets for all using (role_rank(my_role()) >= 3) with check (role_rank(my_role()) >= 3);

drop policy if exists "wards read"  on wards; create policy "wards read"  on wards for select using (true);
drop policy if exists "wards write" on wards; create policy "wards write" on wards for all using (my_role() = 'admin') with check (my_role() = 'admin');

-- Live updates for every connected map
do $$ begin
  alter publication supabase_realtime add table reports;
  alter publication supabase_realtime add table tickets;
  alter publication supabase_realtime add table wards;
exception when duplicate_object then null; end $$;

-- Make yourself admin after your first sign-in:
-- update profiles set role = 'admin' where email = 'you@example.com';
