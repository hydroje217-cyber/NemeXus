-- Reset dashboard data and seed realistic fake data for only:
--   1. Main Chlorination Facility
--   2. Main Deepwell Pump
--
-- Run this in the Supabase SQL editor after the schema is installed.
-- It keeps auth users and public.profiles, but deletes sites, assignments,
-- dashboard readings, and audit logs before inserting fresh demo data.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from public.profiles limit 1) then
    raise exception 'Create at least one app user first. Demo readings need an existing public.profiles.id.';
  end if;
end;
$$;

truncate table
  public.reading_audit_log,
  public.readings,
  public.chlorination_readings,
  public.deepwell_readings,
  public.site_assignments,
  public.sites
restart identity cascade;

insert into public.sites (name, type)
values
  ('Main Chlorination Facility', 'CHLORINATION'),
  ('Main Deepwell Pump', 'DEEPWELL');

with submitter as (
  select id
  from public.profiles
  order by
    case when role = 'operator' and is_approved then 0 else 1 end,
    created_at
  limit 1
),
site_row as (
  select id
  from public.sites
  where name = 'Main Chlorination Facility'
),
slots as (
  select
    slot_datetime,
    floor(extract(epoch from (slot_datetime - (date_trunc('day', now()) - interval '89 days'))) / 86400)::numeric as day_index,
    case extract(hour from slot_datetime)
      when 0 then 0.78::numeric
      when 8 then 1.12::numeric
      else 1.00::numeric
    end as demand_factor,
    case extract(hour from slot_datetime)
      when 0 then 0::numeric
      when 8 then 1::numeric
      else 2::numeric
    end as shift_factor
  from generate_series(
    date_trunc('day', now()) - interval '89 days',
    date_trunc('day', now()) + interval '16 hours',
    interval '8 hours'
  ) as generated(slot_datetime)
),
chlorination_seed as (
  select
    gen_random_uuid() as id,
    site_row.id as site_id,
    submitter.id as submitted_by,
    slots.slot_datetime + interval '5 minutes' + (random() * interval '12 minutes') as reading_datetime,
    slots.slot_datetime,
    case
      when random() < 0.012 then 'rejected'
      when random() < 0.18 then 'approved'
      else 'submitted'
    end as status,
    case
      when random() < 0.018 then 'Low residual follow-up'
      when random() < 0.018 then 'Pump changeover noted'
      when random() < 0.012 then 'Manual verification requested'
      else 'Routine shift reading'
    end as remarks,
    round((128500 + slots.day_index * 930 + slots.shift_factor * 310 + slots.demand_factor * 18 + random()::numeric * 8)::numeric, 2) as totalizer,
    round((52 + slots.demand_factor * 2.4 + random()::numeric * 2.2 - 1.1)::numeric, 2) as pressure_psi,
    round(greatest(0.22, 0.68 - slots.demand_factor * 0.05 + random()::numeric * 0.12 - 0.06)::numeric, 2) as rc_ppm,
    round(greatest(0.2, 0.85 + random()::numeric * 0.35 - 0.12)::numeric, 2) as turbidity_ntu,
    round((7.18 + random()::numeric * 0.18 - 0.09)::numeric, 2) as ph,
    round((188 + random()::numeric * 18 - 9)::numeric, 2) as tds_ppm,
    round(greatest(3500, 23000 + slots.demand_factor * 900 + (sin((slots.day_index / 7.0)::double precision) * 1200)::numeric + random()::numeric * 900 - 450)::numeric, 2) as tank_level_liters,
    round(greatest(8, 39 + slots.demand_factor * 3.6 + random()::numeric * 3 - 1.5)::numeric, 2) as flowrate_m3hr,
    round(greatest(1, 7.6 + slots.demand_factor * 0.7 + random()::numeric * 0.8 - 0.4)::numeric, 2) as chlorine_consumed,
    round(greatest(0.2, 2.4 + random()::numeric * 0.45 - 0.18)::numeric, 2) as peroxide_consumption,
    round(greatest(5, 45 + slots.demand_factor * 3.5 + random()::numeric * 3 - 1.5)::numeric, 2) as chlorination_power_kwh,
    slots.slot_datetime + interval '12 minutes' as created_at,
    slots.slot_datetime + interval '12 minutes' as updated_at
  from slots
  cross join site_row
  cross join submitter
)
insert into public.chlorination_readings (
  id,
  site_id,
  submitted_by,
  reading_datetime,
  slot_datetime,
  status,
  remarks,
  totalizer,
  pressure_psi,
  rc_ppm,
  turbidity_ntu,
  ph,
  tds_ppm,
  tank_level_liters,
  flowrate_m3hr,
  chlorine_consumed,
  peroxide_consumption,
  chlorination_power_kwh,
  created_at,
  updated_at
)
select
  id,
  site_id,
  submitted_by,
  reading_datetime,
  slot_datetime,
  status,
  remarks,
  totalizer,
  pressure_psi,
  rc_ppm,
  turbidity_ntu,
  ph,
  tds_ppm,
  tank_level_liters,
  flowrate_m3hr,
  chlorine_consumed,
  peroxide_consumption,
  chlorination_power_kwh,
  created_at,
  updated_at
from chlorination_seed;

with submitter as (
  select id
  from public.profiles
  order by
    case when role = 'operator' and is_approved then 0 else 1 end,
    created_at
  limit 1
),
site_row as (
  select id
  from public.sites
  where name = 'Main Deepwell Pump'
),
slots as (
  select
    slot_datetime,
    floor(extract(epoch from (slot_datetime - (date_trunc('day', now()) - interval '89 days'))) / 86400)::numeric as day_index,
    case extract(hour from slot_datetime)
      when 0 then 0.72::numeric
      when 6 then 1.08::numeric
      when 12 then 1.18::numeric
      else 0.96::numeric
    end as demand_factor
  from generate_series(
    date_trunc('day', now()) - interval '89 days',
    date_trunc('day', now()) + interval '18 hours',
    interval '6 hours'
  ) as generated(slot_datetime)
),
deepwell_seed as (
  select
    gen_random_uuid() as id,
    site_row.id as site_id,
    submitter.id as submitted_by,
    slots.slot_datetime + interval '7 minutes' + (random() * interval '10 minutes') as reading_datetime,
    slots.slot_datetime,
    case
      when random() < 0.01 then 'rejected'
      when random() < 0.2 then 'approved'
      else 'submitted'
    end as status,
    case
      when random() < 0.018 then 'Backwash completed before reading'
      when random() < 0.014 then 'Voltage imbalance monitored'
      when random() < 0.012 then 'Flow verified at panel'
      else 'Routine shift reading'
    end as remarks,
    round((43 + slots.demand_factor * 1.8 + random()::numeric * 1.8 - 0.9)::numeric, 2) as upstream_pressure_psi,
    round((37 + slots.demand_factor * 1.5 + random()::numeric * 1.6 - 0.8)::numeric, 2) as downstream_pressure_psi,
    round(greatest(6, 31 + slots.demand_factor * 2.8 + (sin((slots.day_index / 11.0)::double precision) * 1.2)::numeric + random()::numeric * 1.8 - 0.9)::numeric, 2) as flowrate_m3hr,
    round(greatest(20, 43 + slots.demand_factor * 2.5 + random()::numeric * 1.6 - 0.8)::numeric, 2) as vfd_frequency_hz,
    round((224 + random()::numeric * 5 - 2.5)::numeric, 2) as voltage_l1_v,
    round((224 + random()::numeric * 5 - 2.5)::numeric, 2) as voltage_l2_v,
    round((224 + random()::numeric * 5 - 2.5)::numeric, 2) as voltage_l3_v,
    round((22 + slots.demand_factor * 1.4 + random()::numeric * 1.6 - 0.8)::numeric, 2) as amperage_a,
    round((268 + (sin((slots.day_index / 14.0)::double precision) * 10)::numeric + random()::numeric * 12 - 6)::numeric, 2) as tds_ppm,
    round(greatest(4, 36 + slots.demand_factor * 3.2 + random()::numeric * 2.2 - 1.1)::numeric, 2) as power_kwh_shift,
    slots.slot_datetime + interval '15 minutes' as created_at,
    slots.slot_datetime + interval '15 minutes' as updated_at
  from slots
  cross join site_row
  cross join submitter
)
insert into public.deepwell_readings (
  id,
  site_id,
  submitted_by,
  reading_datetime,
  slot_datetime,
  status,
  remarks,
  upstream_pressure_psi,
  downstream_pressure_psi,
  flowrate_m3hr,
  vfd_frequency_hz,
  voltage_l1_v,
  voltage_l2_v,
  voltage_l3_v,
  amperage_a,
  tds_ppm,
  power_kwh_shift,
  created_at,
  updated_at
)
select
  id,
  site_id,
  submitted_by,
  reading_datetime,
  slot_datetime,
  status,
  remarks,
  upstream_pressure_psi,
  downstream_pressure_psi,
  flowrate_m3hr,
  vfd_frequency_hz,
  voltage_l1_v,
  voltage_l2_v,
  voltage_l3_v,
  amperage_a,
  tds_ppm,
  power_kwh_shift,
  created_at,
  updated_at
from deepwell_seed;

select
  (select count(*) from public.sites) as sites,
  (select count(*) from public.chlorination_readings) as chlorination_readings,
  (select count(*) from public.deepwell_readings) as deepwell_readings;
