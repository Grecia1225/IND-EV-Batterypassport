-- =====================================================================
-- Migration 03 — Hardening
-- Run in Supabase SQL Editor AFTER schema.sql. (It is self-sufficient: it
-- also creates the migration_02 pieces if you never ran that file.)
-- Safe to re-run.
--
-- What this changes, in plain words:
--   * New accounts must be APPROVED by the admin before they can write.
--   * Readings/usage history are hash-chained and cannot be updated/deleted
--     (even from the SQL editor) without disabling triggers — and any such
--     edit is detected by verify_battery_integrity().
--   * Cycle counts can never go down, and readings must be recorded against
--     the pack the cell currently belongs to — enforced here, not in the browser.
--   * Registering a battery, reusing cells, transferring ownership and
--     listing for sale are single atomic server functions (all-or-nothing).
--   * Marketplace clearance is decided on the server.
--   * Profiles (emails) are no longer publicly readable.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Pieces from migration_02 (idempotent)
-- ---------------------------------------------------------------------
alter table public.batteries add column if not exists photo_url text;

create table if not exists public.cell_flag_events (
  id uuid primary key default gen_random_uuid(),
  cell_id text not null references public.cells(id),
  battery_id text not null references public.batteries(id),
  flagged_at timestamptz not null default now(),
  reason text not null,
  soh_pct numeric
);
alter table public.cell_flag_events enable row level security;

do $$ begin
  insert into storage.buckets (id, name, public) values ('battery-photos', 'battery-photos', true)
  on conflict (id) do nothing;
exception when others then
  raise notice 'Could not create the photo bucket (%). Create a PUBLIC bucket named battery-photos in the Supabase dashboard instead.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 1. Roles: approval flag + helpers
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists approved boolean not null default false;
update public.profiles set approved = true where role = 'admin';

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and approved);
$$;

create or replace function public.is_technician() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and approved);
$$;

-- First account ever = approved admin. Everyone after = technician, NOT approved.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_first boolean;
begin
  perform pg_advisory_xact_lock(424242);
  select count(*) = 0 into v_first from public.profiles;
  insert into public.profiles (id, email, role, approved)
  values (new.id, new.email, case when v_first then 'admin' else 'technician' end, v_first);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Shared helpers
-- ---------------------------------------------------------------------
create or replace function public.reject_modification() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op using errcode = '42501';
end $$;

-- Mirrors src/lib/calculations.ts -> cellSohFromReading() exactly (same constants,
-- same operation order, same rounding), so server and browser agree.
create or replace function public.cell_soh(p_chemistry text, p_cycles integer, p_resistance numeric)
returns double precision language sql immutable as $$
  select greatest(0::float8, least(100::float8,
    floor(
      (
        (100::float8 - (least(1::float8, p_cycles::float8 /
           (case p_chemistry when 'LFP (LiFePO4)' then 3000::float8 when 'NMC' then 1200::float8
                             when 'LTO' then 6000::float8 else 1500::float8 end)) * 100::float8))
        - (case when p_resistance is not null and p_resistance > 0
                then greatest(0::float8, (p_resistance::float8 - 30::float8) / 4::float8)
                else 0::float8 end)
      ) * 10::float8 + 0.5::float8
    ) / 10::float8));
$$;

create or replace function public._hash_reading(
  p_cell_id text, p_battery_id text, p_recorded_at timestamptz, p_voltage numeric,
  p_resistance numeric, p_temperature numeric, p_cycles integer, p_source text, p_prev text)
returns text language sql stable as $$
  select encode(sha256(convert_to(concat_ws('|', 'R1', p_cell_id, p_battery_id,
    to_char(p_recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(p_voltage::text, ''), coalesce(p_resistance::text, ''), coalesce(p_temperature::text, ''),
    p_cycles::text, coalesce(p_source, ''), coalesce(p_prev, '')), 'UTF8')), 'hex');
$$;

create or replace function public._hash_usage(
  p_battery_id text, p_type text, p_at timestamptz, p_detail text, p_by uuid, p_prev text)
returns text language sql stable as $$
  select encode(sha256(convert_to(concat_ws('|', 'U1', p_battery_id, p_type,
    to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(p_detail, ''), coalesce(p_by::text, ''), coalesce(p_prev, '')), 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------
-- 3. cell_readings: chain + validation + flag events
-- ---------------------------------------------------------------------
alter table public.cell_readings add column if not exists chain_pos integer;
alter table public.cell_readings add column if not exists prev_hash text;
alter table public.cell_readings add column if not exists row_hash text;

do $$
declare r record; v_cur text := null; v_pos int := 0; v_prev text := 'GENESIS'; v_h text;
begin
  for r in select * from public.cell_readings where row_hash is null order by cell_id, recorded_at, id loop
    if r.cell_id is distinct from v_cur then v_cur := r.cell_id; v_pos := 0; v_prev := 'GENESIS'; end if;
    v_pos := v_pos + 1;
    v_h := public._hash_reading(r.cell_id, r.battery_id, r.recorded_at, r.voltage_v, r.resistance_mohm,
                                r.temperature_c, r.cycle_count, r.source, v_prev);
    update public.cell_readings set chain_pos = v_pos, prev_hash = v_prev, row_hash = v_h where id = r.id;
    v_prev := v_h;
  end loop;
end $$;

alter table public.cell_readings alter column chain_pos set not null;
alter table public.cell_readings alter column prev_hash set not null;
alter table public.cell_readings alter column row_hash set not null;
create unique index if not exists cell_readings_chain_idx on public.cell_readings (cell_id, chain_pos);

create or replace function public.cell_readings_before_insert() returns trigger
language plpgsql as $$
declare v_cell record; v_last record;
begin
  perform pg_advisory_xact_lock(hashtext('cell_readings:' || new.cell_id));

  select id, current_battery_id into v_cell from public.cells where id = new.cell_id;
  if not found then raise exception 'Unknown cell %', new.cell_id; end if;
  if new.battery_id is distinct from v_cell.current_battery_id then
    raise exception 'Cell % currently belongs to pack %, not %', new.cell_id, v_cell.current_battery_id, new.battery_id;
  end if;

  if new.voltage_v is null or new.voltage_v <= 0 or new.voltage_v > 6 then
    raise exception 'Cell voltage must be between 0 and 6 V (got %)', new.voltage_v; end if;
  if new.resistance_mohm is not null and (new.resistance_mohm < 0 or new.resistance_mohm > 1000) then
    raise exception 'Resistance must be between 0 and 1000 mOhm (got %)', new.resistance_mohm; end if;
  if new.temperature_c is not null and (new.temperature_c < -60 or new.temperature_c > 200) then
    raise exception 'Temperature must be between -60 and 200 C (got %)', new.temperature_c; end if;
  if new.source not in ('manual', 'csv_upload', 'bms_jbd', 'ble_battery_service') then
    raise exception 'Unknown reading source %', new.source; end if;
  if new.recorded_at > now() + interval '5 minutes' then
    raise exception 'A reading cannot be dated in the future'; end if;

  select chain_pos, row_hash, cycle_count, recorded_at into v_last
    from public.cell_readings where cell_id = new.cell_id order by chain_pos desc limit 1;
  if found then
    if new.recorded_at < v_last.recorded_at then
      -- two writers racing on the same cell can differ by milliseconds: clamp, don't reject
      if v_last.recorded_at - new.recorded_at <= interval '2 seconds' then
        new.recorded_at := v_last.recorded_at;
      else
        raise exception 'Readings must be added in time order (last reading for % was %)', new.cell_id, v_last.recorded_at;
      end if;
    end if;
    if new.cycle_count < v_last.cycle_count then
      raise exception 'Cycle count cannot decrease — last recorded was %', v_last.cycle_count;
    end if;
    new.chain_pos := v_last.chain_pos + 1;
    new.prev_hash := v_last.row_hash;
  else
    new.chain_pos := 1;
    new.prev_hash := 'GENESIS';
  end if;

  new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  new.row_hash := public._hash_reading(new.cell_id, new.battery_id, new.recorded_at, new.voltage_v,
                    new.resistance_mohm, new.temperature_c, new.cycle_count, new.source, new.prev_hash);
  return new;
end $$;

create or replace function public.cell_readings_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_chem text; v_prev record; v_prev_soh float8; v_new_soh float8;
begin
  select chemistry into v_chem from public.batteries where id = new.battery_id;
  v_new_soh := public.cell_soh(v_chem, new.cycle_count, new.resistance_mohm);
  select cycle_count, resistance_mohm into v_prev from public.cell_readings
    where cell_id = new.cell_id and chain_pos = new.chain_pos - 1;
  if found then v_prev_soh := public.cell_soh(v_chem, v_prev.cycle_count, v_prev.resistance_mohm);
  else v_prev_soh := 100; end if;
  if v_prev_soh > 20 and v_new_soh <= 20 then
    insert into public.cell_flag_events (cell_id, battery_id, reason, soh_pct)
    values (new.cell_id, new.battery_id,
            format('Dropped to %s%% life — below the 20%% replace line', v_new_soh), v_new_soh);
  end if;
  return new;
end $$;

drop trigger if exists cell_readings_bi on public.cell_readings;
create trigger cell_readings_bi before insert on public.cell_readings
  for each row execute function public.cell_readings_before_insert();
drop trigger if exists cell_readings_ai on public.cell_readings;
create trigger cell_readings_ai after insert on public.cell_readings
  for each row execute function public.cell_readings_after_insert();
drop trigger if exists cell_readings_immutable on public.cell_readings;
create trigger cell_readings_immutable before update or delete on public.cell_readings
  for each row execute function public.reject_modification();
drop trigger if exists cell_readings_notruncate on public.cell_readings;
create trigger cell_readings_notruncate before truncate on public.cell_readings
  for each statement execute function public.reject_modification();

-- ---------------------------------------------------------------------
-- 4. usage_history: chain
-- ---------------------------------------------------------------------
alter table public.usage_history add column if not exists chain_pos integer;
alter table public.usage_history add column if not exists prev_hash text;
alter table public.usage_history add column if not exists row_hash text;

do $$
declare r record; v_cur text := null; v_pos int := 0; v_prev text := 'GENESIS'; v_h text; v_prev_id uuid;
begin
  for r in select * from public.usage_history where row_hash is null order by battery_id, event_at, id loop
    if r.battery_id is distinct from v_cur then v_cur := r.battery_id; v_pos := 0; v_prev := 'GENESIS'; v_prev_id := null; end if;
    v_pos := v_pos + 1;
    v_h := public._hash_usage(r.battery_id, r.event_type, r.event_at, r.detail, r.created_by, v_prev);
    update public.usage_history set chain_pos = v_pos, prev_hash = v_prev, row_hash = v_h, previous_event_id = v_prev_id where id = r.id;
    v_prev := v_h; v_prev_id := r.id;
  end loop;
end $$;

alter table public.usage_history alter column chain_pos set not null;
alter table public.usage_history alter column prev_hash set not null;
alter table public.usage_history alter column row_hash set not null;
create unique index if not exists usage_history_chain_idx on public.usage_history (battery_id, chain_pos);

create or replace function public.usage_history_before_insert() returns trigger
language plpgsql as $$
declare v_last record;
begin
  perform pg_advisory_xact_lock(hashtext('usage_history:' || new.battery_id));
  new.event_at := clock_timestamp();
  select id, chain_pos, row_hash into v_last from public.usage_history
    where battery_id = new.battery_id order by chain_pos desc limit 1;
  if found then
    new.chain_pos := v_last.chain_pos + 1; new.prev_hash := v_last.row_hash; new.previous_event_id := v_last.id;
  else
    new.chain_pos := 1; new.prev_hash := 'GENESIS'; new.previous_event_id := null;
  end if;
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.row_hash := public._hash_usage(new.battery_id, new.event_type, new.event_at, new.detail, new.created_by, new.prev_hash);
  return new;
end $$;

drop trigger if exists usage_history_bi on public.usage_history;
create trigger usage_history_bi before insert on public.usage_history
  for each row execute function public.usage_history_before_insert();
drop trigger if exists usage_history_immutable on public.usage_history;
create trigger usage_history_immutable before update or delete on public.usage_history
  for each row execute function public.reject_modification();
drop trigger if exists usage_history_notruncate on public.usage_history;
create trigger usage_history_notruncate before truncate on public.usage_history
  for each statement execute function public.reject_modification();

-- ---------------------------------------------------------------------
-- 5. Other tables: validation + immutability
-- ---------------------------------------------------------------------
alter table public.pack_readings add column if not exists source text not null default 'manual';

create or replace function public.pack_readings_before_insert() returns trigger
language plpgsql as $$
declare t numeric;
begin
  if not exists (select 1 from public.batteries where id = new.battery_id) then
    raise exception 'Unknown battery %', new.battery_id; end if;
  if new.state_of_charge_pct is not null and (new.state_of_charge_pct < 0 or new.state_of_charge_pct > 100) then
    raise exception 'State of charge must be between 0 and 100'; end if;
  foreach t in array array[new.temp_sensor_1, new.temp_sensor_2, new.temp_sensor_3,
                           new.temp_sensor_4, new.temp_sensor_5, new.temp_sensor_6] loop
    if t is not null and (t < -60 or t > 200) then
      raise exception 'Temperature must be between -60 and 200 C (got %)', t; end if;
  end loop;
  if new.source not in ('manual', 'bms_jbd', 'ble_battery_service') then
    raise exception 'Unknown reading source %', new.source; end if;
  if new.recorded_at > now() + interval '5 minutes' then
    raise exception 'A reading cannot be dated in the future'; end if;
  new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  return new;
end $$;
drop trigger if exists pack_readings_bi on public.pack_readings;
create trigger pack_readings_bi before insert on public.pack_readings
  for each row execute function public.pack_readings_before_insert();
drop trigger if exists pack_readings_immutable on public.pack_readings;
create trigger pack_readings_immutable before update or delete on public.pack_readings
  for each row execute function public.reject_modification();

drop trigger if exists flag_events_immutable on public.cell_flag_events;
create trigger flag_events_immutable before update or delete on public.cell_flag_events
  for each row execute function public.reject_modification();

create or replace function public.batteries_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Batteries cannot be deleted'; end if;
  if (new.id, new.maker, new.model, new.place_of_manufacture, new.manufacture_date, new.chemistry,
      new.cell_count, new.nominal_voltage, new.capacity_ah, new.vehicle_type, new.odometer_km,
      new.registered_at, new.is_retro_registration, new.retro_note, new.created_by, new.photo_url)
     is distinct from
     (old.id, old.maker, old.model, old.place_of_manufacture, old.manufacture_date, old.chemistry,
      old.cell_count, old.nominal_voltage, old.capacity_ah, old.vehicle_type, old.odometer_km,
      old.registered_at, old.is_retro_registration, old.retro_note, old.created_by, old.photo_url) then
    raise exception 'Only owner_name can change after registration';
  end if;
  return new;
end $$;
drop trigger if exists batteries_guard_t on public.batteries;
create trigger batteries_guard_t before update or delete on public.batteries
  for each row execute function public.batteries_guard();

create or replace function public.cells_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Cells cannot be deleted'; end if;
  if (new.id, new.manufacture_date, new.original_battery_id, new.created_at)
     is distinct from (old.id, old.manufacture_date, old.original_battery_id, old.created_at) then
    raise exception 'Only a cell''s pack assignment can change';
  end if;
  return new;
end $$;
drop trigger if exists cells_guard_t on public.cells;
create trigger cells_guard_t before update or delete on public.cells
  for each row execute function public.cells_guard();

create or replace function public.cell_pack_history_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Cell history cannot be deleted'; end if;
  if old.moved_out_at is not null or new.moved_out_at is null
     or (new.id, new.cell_id, new.battery_id, new.position_in_pack, new.moved_in_at, new.note)
        is distinct from (old.id, old.cell_id, old.battery_id, old.position_in_pack, old.moved_in_at, old.note) then
    raise exception 'Cell history rows can only be closed once, never edited';
  end if;
  return new;
end $$;
drop trigger if exists cell_pack_history_guard_t on public.cell_pack_history;
create trigger cell_pack_history_guard_t before update or delete on public.cell_pack_history
  for each row execute function public.cell_pack_history_guard();

-- Listings: one ACTIVE listing per battery (a sold/withdrawn one can be re-listed later)
alter table public.marketplace_listings drop constraint if exists marketplace_listings_battery_id_key;
create unique index if not exists marketplace_one_active_listing
  on public.marketplace_listings (battery_id) where status = 'active';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'marketplace_status_valid') then
    alter table public.marketplace_listings add constraint marketplace_status_valid
      check (status in ('active', 'sold', 'withdrawn'));
  end if;
end $$;
create or replace function public.listings_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Listings cannot be deleted'; end if;
  if old.status <> 'active' then raise exception 'A % listing cannot be changed', old.status; end if;
  if (new.id, new.battery_id, new.seller_id, new.asking_price, new.listed_at)
     is distinct from (old.id, old.battery_id, old.seller_id, old.asking_price, old.listed_at) then
    raise exception 'Only a listing''s status can change';
  end if;
  return new;
end $$;
drop trigger if exists listings_guard_t on public.marketplace_listings;
create trigger listings_guard_t before update or delete on public.marketplace_listings
  for each row execute function public.listings_guard();

-- ---------------------------------------------------------------------
-- 6. Row-level security: reads stay public, writes need an APPROVED account
-- ---------------------------------------------------------------------
drop policy if exists "Signed-in users can register batteries" on public.batteries;
drop policy if exists "Signed-in users can manage cells" on public.cells;
drop policy if exists "Signed-in users can write cell history" on public.cell_pack_history;
drop policy if exists "Signed-in users can add readings" on public.cell_readings;
drop policy if exists "Approved technicians can add readings" on public.cell_readings;
create policy "Approved technicians can add readings" on public.cell_readings
  for insert with check (public.is_technician());
drop policy if exists "Signed-in users can add pack readings" on public.pack_readings;
drop policy if exists "Approved technicians can add pack readings" on public.pack_readings;
create policy "Approved technicians can add pack readings" on public.pack_readings
  for insert with check (public.is_technician());
drop policy if exists "Signed-in users can add usage history" on public.usage_history;
drop policy if exists "Sellers can create their own listings" on public.marketplace_listings;
drop policy if exists "Signed-in users can log flag events" on public.cell_flag_events;
drop policy if exists "Public can view flag events" on public.cell_flag_events;
create policy "Public can view flag events" on public.cell_flag_events for select using (true);

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Read own profile or admin reads all" on public.profiles;
create policy "Read own profile or admin reads all" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- Photos: approved technicians only, images only, 5 MB max.
-- Wrapped so that a storage-permission problem on your project can never block the security fixes above.
do $$ begin
  update storage.buckets set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'battery-photos';
  drop policy if exists "Signed-in users can upload battery photos" on storage.objects;
  drop policy if exists "Approved technicians can upload battery photos" on storage.objects;
  create policy "Approved technicians can upload battery photos" on storage.objects
    for insert with check (bucket_id = 'battery-photos' and public.is_technician());
  drop policy if exists "Public can view battery photos" on storage.objects;
  create policy "Public can view battery photos" on storage.objects
    for select using (bucket_id = 'battery-photos');
exception when others then
  raise notice 'Photo-storage rules were NOT changed (%). Everything else was applied.', sqlerrm;
end $$;

drop view if exists public.technician_stats;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Read-only server functions (public)
-- ---------------------------------------------------------------------
-- Mirrors src/lib/calculations.ts: weakest-cell SoH, stage lines (80/60),
-- confidence, and checkMarketplaceClearance().
create or replace function public.battery_clearance(p_battery_id text, p_now timestamptz default now())
returns table (passed boolean, reason text, soh double precision, stage text, confidence integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_chem text; v_cells int := 0; v_weakest float8 := null; v_sum float8 := 0;
  c record; lr record; v_cnt int; v_s float8; v_age_ms float8; v_rec float8; v_depth float8;
  v_year constant float8 := 31536000000;  -- 365 days in ms, as in calculations.ts
  v_stage text; v_conf int; v_passed boolean; v_reason text;
begin
  select chemistry into v_chem from public.batteries where id = p_battery_id;
  if not found then raise exception 'Battery % not found', p_battery_id; end if;

  for c in select id from public.cells where current_battery_id = p_battery_id loop
    v_cells := v_cells + 1;
    select count(*)::int into v_cnt from public.cell_readings where cell_id = c.id;
    if v_cnt = 0 then
      v_weakest := least(coalesce(v_weakest, 100), 100);
    else
      select * into lr from public.cell_readings where cell_id = c.id order by chain_pos desc limit 1;
      v_s := public.cell_soh(v_chem, lr.cycle_count, lr.resistance_mohm);
      v_weakest := least(coalesce(v_weakest, v_s), v_s);
      v_age_ms := extract(epoch from (p_now - lr.recorded_at)) * 1000;
      v_rec := case when v_age_ms <= v_year then 1 else greatest(0, 1 - (v_age_ms - v_year) / v_year) end;
      v_depth := least(1.0, v_cnt / 3.0);
      v_sum := v_sum + (v_rec * 0.6 + v_depth * 0.4);
    end if;
  end loop;

  if v_cells = 0 then v_weakest := 100; v_conf := 0;
  else v_conf := floor(v_sum / v_cells * 100 + 0.5)::int; end if;

  v_stage := case when v_weakest >= 80 then 'healthy' when v_weakest >= 60 then 'second-life' else 'retire' end;
  if v_stage = 'retire' then
    v_passed := false; v_reason := 'Weakest cell is below the 60% storage threshold — not eligible for resale.';
  elsif v_conf < 30 then
    v_passed := false; v_reason := 'Not enough recent readings on record to certify this listing.';
  else
    v_passed := true; v_reason := 'Meets resale health and evidence requirements.';
  end if;
  return query select v_passed, v_reason, v_weakest, v_stage, v_conf;
end $$;

-- Re-computes every hash for the pack's cells and usage timeline.
create or replace function public.verify_battery_integrity(p_battery_id text)
returns table (ok boolean, readings_checked integer, events_checked integer, first_problem text)
language plpgsql stable security definer set search_path = public as $$
declare r record; v_cur text := null; v_exp_prev text; v_exp_pos int; v_nr int := 0; v_ne int := 0; v_prob text := null;
begin
  for r in select cr.* from public.cell_readings cr join public.cells c on c.id = cr.cell_id
           where c.current_battery_id = p_battery_id order by cr.cell_id, cr.chain_pos loop
    if r.cell_id is distinct from v_cur then v_cur := r.cell_id; v_exp_prev := 'GENESIS'; v_exp_pos := 1; end if;
    v_nr := v_nr + 1;
    if v_prob is null then
      if r.chain_pos <> v_exp_pos then
        v_prob := format('missing reading before position %s of cell %s', r.chain_pos, r.cell_id);
      elsif r.prev_hash is distinct from v_exp_prev then
        v_prob := format('broken link at reading %s of cell %s', r.chain_pos, r.cell_id);
      elsif r.row_hash is distinct from public._hash_reading(r.cell_id, r.battery_id, r.recorded_at, r.voltage_v,
              r.resistance_mohm, r.temperature_c, r.cycle_count, r.source, r.prev_hash) then
        v_prob := format('edited reading %s of cell %s', r.chain_pos, r.cell_id);
      end if;
    end if;
    v_exp_prev := r.row_hash; v_exp_pos := v_exp_pos + 1;
  end loop;

  v_exp_prev := 'GENESIS'; v_exp_pos := 1;
  for r in select * from public.usage_history where battery_id = p_battery_id order by chain_pos loop
    v_ne := v_ne + 1;
    if v_prob is null then
      if r.chain_pos <> v_exp_pos then
        v_prob := format('missing history event before position %s', r.chain_pos);
      elsif r.prev_hash is distinct from v_exp_prev then
        v_prob := format('broken link at history event %s', r.chain_pos);
      elsif r.row_hash is distinct from public._hash_usage(r.battery_id, r.event_type, r.event_at, r.detail, r.created_by, r.prev_hash) then
        v_prob := format('edited history event %s', r.chain_pos);
      end if;
    end if;
    v_exp_prev := r.row_hash; v_exp_pos := v_exp_pos + 1;
  end loop;

  return query select v_prob is null, v_nr, v_ne, v_prob;
end $$;

-- ---------------------------------------------------------------------
-- 8. Write functions (atomic, checked on the server)
-- ---------------------------------------------------------------------
create or replace function public.register_battery(payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id text; v_tries int := 0; v_mfg date;
  v_retro boolean := coalesce((payload->>'is_retro_registration')::boolean, false);
  v_n int; v_item jsonb; v_pos int := 0; v_cid text; v_ex record; v_donor text;
begin
  if not public.is_technician() then
    raise exception 'Your account is not approved to register batteries yet'; end if;
  if coalesce(trim(payload->>'maker'), '') = '' or coalesce(trim(payload->>'model'), '') = ''
     or coalesce(trim(payload->>'chemistry'), '') = '' then
    raise exception 'Maker, model and chemistry are required'; end if;
  v_n := jsonb_array_length(coalesce(payload->'cells', '[]'::jsonb));
  if v_n < 1 or v_n > 500 then raise exception 'A pack needs between 1 and 500 cells'; end if;
  if (payload->>'cell_count')::int is distinct from v_n then
    raise exception 'cell_count does not match the cells provided'; end if;
  v_mfg := nullif(payload->>'manufacture_date', '')::date;
  if v_mfg is null or v_mfg > current_date then
    raise exception 'A valid manufacture date (not in the future) is required'; end if;

  loop
    v_id := 'DBP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.batteries where id = v_id);
    v_tries := v_tries + 1;
    if v_tries > 20 then raise exception 'Could not allocate a battery ID'; end if;
  end loop;

  insert into public.batteries (id, maker, model, place_of_manufacture, manufacture_date, chemistry, cell_count,
      nominal_voltage, capacity_ah, owner_name, vehicle_type, is_retro_registration, retro_note, created_by, photo_url)
  values (v_id, trim(payload->>'maker'), trim(payload->>'model'), nullif(trim(payload->>'place_of_manufacture'), ''),
      v_mfg, trim(payload->>'chemistry'), v_n, (payload->>'nominal_voltage')::numeric, (payload->>'capacity_ah')::numeric,
      nullif(trim(payload->>'owner_name'), ''), nullif(trim(payload->>'vehicle_type'), ''), v_retro,
      case when v_retro then format('This battery was already in use before registration. Tracked history starts %s — earlier usage was not recorded.',
                                    to_char(now() at time zone 'UTC', 'DD Mon YYYY')) else null end,
      v_uid, nullif(payload->>'photo_url', ''));

  insert into public.usage_history (battery_id, event_type, detail)
  values (v_id, 'registration', case when v_retro
      then 'Registered as already in use (retro-registration) — tracked history starts here'
      else 'Registered' end);

  for v_item in select value from jsonb_array_elements(payload->'cells') loop
    v_pos := v_pos + 1;
    if coalesce((v_item->>'reused')::boolean, false) then
      v_cid := nullif(trim(v_item->>'existing_cell_id'), '');
      if v_cid is null then raise exception 'Position %: reused cell needs an existing cell ID', v_pos; end if;
      select * into v_ex from public.cells where id = v_cid for update;
      if not found then raise exception 'Cell % does not exist', v_cid; end if;
      v_donor := v_ex.current_battery_id;
      if v_donor = v_id then raise exception 'Cell % was listed more than once', v_cid; end if;
      if not public.is_admin() and not exists (select 1 from public.batteries b where b.id = v_donor and b.created_by = v_uid) then
        raise exception 'You can only reuse cells from packs you registered (an admin can reuse any)'; end if;
      if exists (select 1 from public.marketplace_listings where battery_id = v_donor and status = 'active') then
        raise exception 'Pack % has an active listing — withdraw it before removing cells', v_donor; end if;

      update public.cell_pack_history set moved_out_at = now() where cell_id = v_cid and moved_out_at is null;
      update public.cells set current_battery_id = v_id, position_in_pack = v_pos where id = v_cid;
      insert into public.cell_pack_history (cell_id, battery_id, position_in_pack, note)
        values (v_cid, v_id, v_pos, 'Reused from ' || v_donor);
      insert into public.usage_history (battery_id, event_type, detail)
        values (v_donor, 'cell_removed', format('Cell %s removed and reused in pack %s', v_cid, v_id));
      insert into public.usage_history (battery_id, event_type, detail)
        values (v_id, 'cell_installed', format('Cell %s installed from pack %s — full history carried over', v_cid, v_donor));
    else
      v_tries := 0;
      loop
        v_cid := 'CELL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        exit when not exists (select 1 from public.cells where id = v_cid);
        v_tries := v_tries + 1;
        if v_tries > 20 then raise exception 'Could not allocate a cell ID'; end if;
      end loop;
      insert into public.cells (id, current_battery_id, position_in_pack, manufacture_date, original_battery_id)
        values (v_cid, v_id, v_pos, coalesce(nullif(v_item->>'manufacture_date', '')::date, v_mfg), v_id);
      insert into public.cell_pack_history (cell_id, battery_id, position_in_pack) values (v_cid, v_id, v_pos);
    end if;
  end loop;
  return v_id;
end $$;

create or replace function public.transfer_ownership(p_battery_id text, p_new_owner text) returns void
language plpgsql security definer set search_path = public as $$
declare v_b record; v_new text := trim(coalesce(p_new_owner, ''));
begin
  if not public.is_technician() then raise exception 'Your account is not approved yet'; end if;
  select * into v_b from public.batteries where id = p_battery_id for update;
  if not found then raise exception 'Battery % not found', p_battery_id; end if;
  if v_b.created_by is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only the technician who registered this battery (or an admin) can record a transfer'; end if;
  if v_new = '' or length(v_new) > 120 then raise exception 'New owner name is required (max 120 characters)'; end if;
  if lower(v_new) = lower(coalesce(v_b.owner_name, '')) then raise exception 'That is already the current owner'; end if;
  update public.batteries set owner_name = v_new where id = p_battery_id;
  insert into public.usage_history (battery_id, event_type, detail)
    values (p_battery_id, 'ownership_change',
            format('Ownership transferred from %s to %s', coalesce(v_b.owner_name, '(none)'), v_new));
  update public.marketplace_listings set status = 'sold' where battery_id = p_battery_id and status = 'active';
end $$;

create or replace function public.create_listing(p_battery_id text, p_price numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_b record; v_c record; v_id uuid;
begin
  if not public.is_technician() then raise exception 'Your account is not approved yet'; end if;
  select * into v_b from public.batteries where id = p_battery_id;
  if not found then raise exception 'Battery % not found', p_battery_id; end if;
  if v_b.created_by is distinct from auth.uid() and not public.is_admin() then
    raise exception 'You can only list batteries you registered'; end if;
  if p_price is null or p_price <= 0 or p_price >= 100000000 then
    raise exception 'Enter a price between 1 and 99,999,999'; end if;
  select * into v_c from public.battery_clearance(p_battery_id);
  if not v_c.passed then raise exception 'Clearance failed: %', v_c.reason; end if;
  begin
    insert into public.marketplace_listings (battery_id, seller_id, asking_price, clearance_passed, clearance_reason)
    values (p_battery_id, auth.uid(), p_price, true, v_c.reason) returning id into v_id;
  exception when unique_violation then
    raise exception 'This battery already has an active listing';
  end;
  return v_id;
end $$;

create or replace function public.withdraw_listing(p_listing_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_l record;
begin
  select * into v_l from public.marketplace_listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_l.seller_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only the seller (or an admin) can withdraw a listing'; end if;
  if v_l.status <> 'active' then raise exception 'This listing is already %', v_l.status; end if;
  update public.marketplace_listings set status = 'withdrawn' where id = p_listing_id;
end $$;

create or replace function public.approve_technician(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can approve technicians'; end if;
  update public.profiles set approved = true where id = target;
end $$;

create or replace function public.list_pending_technicians()
returns table (id uuid, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can see pending accounts'; end if;
  return query select p.id, p.email, p.created_at from public.profiles p where not p.approved order by p.created_at;
end $$;

create or replace function public.technician_stats_list()
returns table (technician_id uuid, display_name text, readings_logged bigint, csv_readings bigint,
               bms_readings bigint, first_reading_at timestamptz, last_reading_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_technician() then raise exception 'Your account is not approved yet'; end if;
  return query
    select cr.recorded_by,
           case when public.is_admin() then coalesce(p.email, cr.recorded_by::text)
                else 'Technician ' || substr(cr.recorded_by::text, 1, 8) end,
           count(*), count(*) filter (where cr.source = 'csv_upload'),
           count(*) filter (where cr.source in ('bms_jbd', 'ble_battery_service')),
           min(cr.recorded_at), max(cr.recorded_at)
    from public.cell_readings cr left join public.profiles p on p.id = cr.recorded_by
    where cr.recorded_by is not null
    group by cr.recorded_by, p.email
    order by count(*) desc;
end $$;

-- ---------------------------------------------------------------------
-- 9. Who may call what
-- ---------------------------------------------------------------------
revoke execute on function
  public.register_battery(jsonb), public.transfer_ownership(text, text), public.create_listing(text, numeric),
  public.withdraw_listing(uuid), public.approve_technician(uuid), public.list_pending_technicians(),
  public.technician_stats_list()
from public, anon;
grant execute on function
  public.register_battery(jsonb), public.transfer_ownership(text, text), public.create_listing(text, numeric),
  public.withdraw_listing(uuid), public.approve_technician(uuid), public.list_pending_technicians(),
  public.technician_stats_list()
to authenticated;

notify pgrst, 'reload schema';
commit;