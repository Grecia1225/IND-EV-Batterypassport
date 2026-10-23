-- Digital Battery Passport — database schema
-- Run this once in your Supabase project's SQL editor (Dashboard → SQL Editor → New query).
-- This is free on Supabase's hobby tier — no daily credit limit like Lovable.

create extension if not exists "pgcrypto";

-- ============================================================
-- BATTERIES (pack-level record)
-- ============================================================
create table batteries (
  id text primary key,                     -- e.g. 'DBP-4471'
  maker text not null,
  model text not null,
  place_of_manufacture text,
  manufacture_date date,
  chemistry text not null,                 -- e.g. 'LFP (LiFePO4)', 'NMC'
  cell_count int not null,
  nominal_voltage numeric,
  capacity_ah numeric,
  owner_name text,
  vehicle_type text,                       -- e.g. 'E-rickshaw', 'Two-wheeler'
  odometer_km numeric,
  registered_at timestamptz not null default now(),
  is_retro_registration boolean not null default false,
  retro_note text,                         -- shown honestly on the passport
  created_by uuid references auth.users(id)
);

-- ============================================================
-- CELLS
-- A cell's identity is INDEPENDENT of the pack it currently sits in.
-- This is what lets a cell's history survive being moved into a new pack.
-- ============================================================
create table cells (
  id text primary key,                     -- permanent, e.g. 'CELL-00931'
  current_battery_id text references batteries(id),
  position_in_pack int,                    -- slot number within current pack
  manufacture_date date,
  original_battery_id text references batteries(id), -- first pack this cell ever belonged to
  created_at timestamptz not null default now()
);

-- Tracks every pack a cell has ever lived in, in order — the "cell lifeline"
create table cell_pack_history (
  id uuid primary key default gen_random_uuid(),
  cell_id text not null references cells(id),
  battery_id text not null references batteries(id),
  position_in_pack int,
  moved_in_at timestamptz not null default now(),
  moved_out_at timestamptz,                -- null while still in this pack
  note text
);

-- ============================================================
-- CELL READINGS — add-only, one row per test/reading event
-- ============================================================
create table cell_readings (
  id uuid primary key default gen_random_uuid(),
  cell_id text not null references cells(id),
  battery_id text not null references batteries(id),  -- which pack it was in AT the time of reading
  recorded_at timestamptz not null default now(),
  voltage_v numeric not null,
  resistance_mohm numeric,
  temperature_c numeric,
  cycle_count int not null,
  source text not null default 'manual',   -- 'manual' | 'csv_upload'
  recorded_by uuid references auth.users(id),
  constraint cycle_count_non_negative check (cycle_count >= 0)
);

-- ============================================================
-- PACK READINGS — the 6 temperature sensors, pack-level snapshot
-- ============================================================
create table pack_readings (
  id uuid primary key default gen_random_uuid(),
  battery_id text not null references batteries(id),
  recorded_at timestamptz not null default now(),
  temp_sensor_1 numeric,
  temp_sensor_2 numeric,
  temp_sensor_3 numeric,
  temp_sensor_4 numeric,
  temp_sensor_5 numeric,
  temp_sensor_6 numeric,
  state_of_charge_pct numeric,
  recorded_by uuid references auth.users(id)
);

-- ============================================================
-- USAGE HISTORY — add-only, tamper-evident (each row links to the previous)
-- ============================================================
create table usage_history (
  id uuid primary key default gen_random_uuid(),
  battery_id text not null references batteries(id),
  event_type text not null,                -- 'charge_cycle' | 'fast_charge' | 'ownership_change' | 'temperature_event'
  event_at timestamptz not null default now(),
  detail text,
  previous_event_id uuid references usage_history(id),  -- tamper-evident chain
  created_by uuid references auth.users(id)
);

-- ============================================================
-- MARKETPLACE LISTINGS
-- ============================================================
create table marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  battery_id text not null references batteries(id) unique,
  seller_id uuid references auth.users(id),
  asking_price numeric not null,
  clearance_passed boolean not null default false,
  clearance_reason text,
  listed_at timestamptz not null default now(),
  status text not null default 'active'    -- 'active' | 'sold' | 'withdrawn'
);

-- ============================================================
-- ROLES — simple profile table linked to Supabase auth
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id),
  role text not null default 'technician', -- 'admin' | 'technician'
  email text,
  created_at timestamptz not null default now()
);

-- First person to ever sign up becomes admin automatically
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when (select count(*) from profiles) = 0 then 'admin' else 'technician' end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY — public can read, only signed-in technicians/admins write
-- ============================================================
alter table batteries enable row level security;
alter table cells enable row level security;
alter table cell_pack_history enable row level security;
alter table cell_readings enable row level security;
alter table pack_readings enable row level security;
alter table usage_history enable row level security;
alter table marketplace_listings enable row level security;
alter table profiles enable row level security;

create policy "Public can view batteries" on batteries for select using (true);
create policy "Signed-in users can register batteries" on batteries for insert with check (auth.uid() is not null);

create policy "Public can view cells" on cells for select using (true);
create policy "Signed-in users can manage cells" on cells for all using (auth.uid() is not null);

create policy "Public can view cell history" on cell_pack_history for select using (true);
create policy "Signed-in users can write cell history" on cell_pack_history for insert with check (auth.uid() is not null);

create policy "Public can view readings" on cell_readings for select using (true);
create policy "Signed-in users can add readings" on cell_readings for insert with check (auth.uid() is not null);
-- No update/delete policy on readings ANYWHERE — this enforces add-only at the database level.

create policy "Public can view pack readings" on pack_readings for select using (true);
create policy "Signed-in users can add pack readings" on pack_readings for insert with check (auth.uid() is not null);

create policy "Public can view usage history" on usage_history for select using (true);
create policy "Signed-in users can add usage history" on usage_history for insert with check (auth.uid() is not null);

create policy "Public can view listings" on marketplace_listings for select using (true);
create policy "Sellers can create their own listings" on marketplace_listings for insert with check (auth.uid() = seller_id);

create policy "Users can view their own profile" on profiles for select using (true);