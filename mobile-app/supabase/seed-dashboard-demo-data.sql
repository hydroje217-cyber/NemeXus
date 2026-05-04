-- Realistic demo data for checking the manager dashboard with a fuller database.
-- Run this in the Supabase SQL editor after the main schema is installed.
--
-- Requirement:
--   At least one row must exist in public.profiles because readings need a
--   submitted_by profile id. Sign up once through the app before running this.
--
-- This script is repeatable. It inserts or updates readings by site/time slot.
-- The generated values are intentionally site-specific instead of purely random:
--   - totalizers trend upward by expected daily production
--   - pressures, flow, chemical consumption, pH, TDS, and power stay in realistic bands
--   - morning/evening shifts carry different demand
--   - rare remarks/statuses mimic field exceptions

create extension if not exists pgcrypto;

insert into public.sites (name, type)
values
  ('North Zone Chlorination Station', 'CHLORINATION'),
  ('South Zone Chlorination Station', 'CHLORINATION'),
  ('Deepwell Station 1', 'DEEPWELL'),
  ('Deepwell Station 2', 'DEEPWELL')
on conflict (name) do update
set type = excluded.type;

do $$
begin
  if not exists (select 1 from public.profiles limit 1) then
    raise exception 'Create at least one app user first. Demo readings need an existing public.profiles.id.';
  end if;
end;
$$;

with submitter as (
  select id
  from public.profiles
  order by
    case when role = 'operator' and is_approved then 0 else 1 end,
    created_at
  limit 1
),
site_profile as (
  select *
  from (
    values
      ('North Zone Chlorination Station'::text, 128500::numeric, 930::numeric, 52::numeric, 0.68::numeric, 0.85::numeric, 7.18::numeric, 188::numeric, 23000::numeric, 39::numeric, 7.6::numeric, 2.4::numeric, 45::numeric),
      ('South Zone Chlorination Station'::text,  86400::numeric, 640::numeric, 46::numeric, 0.57::numeric, 1.12::numeric, 7.08::numeric, 214::numeric, 17000::numeric, 29::numeric, 5.2::numeric, 1.8::numeric, 34::numeric)
  ) as p(
    site_name,
    totalizer_start,
    daily_volume_m3,
    pressure_base,
    rc_target,
    turbidity_base,
    ph_base,
    tds_base,
    tank_base,
    flow_base,
    chlorine_shift_base,
    peroxide_shift_base,
    power_shift_base
  )
),
chlorination_slots as (
  select
    generate_series(
      date_trunc('day', now()) - interval '89 days',
      date_trunc('day', now()) + interval '16 hours',
      interval '8 hours'
    ) as slot_datetime
),
chlorination_seed as (
  select
    gen_random_uuid() as id,
    sites.id as site_id,
    submitter.id as submitted_by,
    slot.slot_datetime + interval '5 minutes' + (random() * interval '12 minutes') as reading_datetime,
    slot.slot_datetime,
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
    round((
      p.totalizer_start
      + days_since_start * p.daily_volume_m3
      + shift_factor * (p.daily_volume_m3 / 3)
      + demand_factor * 18
      + random()::numeric * 8
    )::numeric, 2) as totalizer,
    round((p.pressure_base + demand_factor * 2.4 + random()::numeric * 2.2 - 1.1)::numeric, 2) as pressure_psi,
    round(greatest(0.22, (p.rc_target - demand_factor * 0.05 + random()::numeric * 0.12 - 0.06))::numeric, 2) as rc_ppm,
    round(greatest(0.2, (p.turbidity_base + random()::numeric * 0.35 - 0.12))::numeric, 2) as turbidity_ntu,
    round((p.ph_base + random()::numeric * 0.18 - 0.09)::numeric, 2) as ph,
    round((p.tds_base + random()::numeric * 18 - 9)::numeric, 2) as tds_ppm,
    round(greatest(3500, (p.tank_base + demand_factor * 900 + (sin((days_since_start / 7.0)::double precision) * 1200)::numeric + random()::numeric * 900 - 450))::numeric, 2) as tank_level_liters,
    round(greatest(8, (p.flow_base + demand_factor * 3.6 + random()::numeric * 3 - 1.5))::numeric, 2) as flowrate_m3hr,
    round(greatest(1, (p.chlorine_shift_base + demand_factor * 0.7 + random()::numeric * 0.8 - 0.4))::numeric, 2) as chlorine_consumed,
    round(greatest(0.2, (p.peroxide_shift_base + random()::numeric * 0.45 - 0.18))::numeric, 2) as peroxide_consumption,
    round(greatest(5, (p.power_shift_base + demand_factor * 3.5 + random()::numeric * 3 - 1.5))::numeric, 2) as chlorination_power_kwh,
    slot.slot_datetime + interval '12 minutes' as created_at,
    slot.slot_datetime + interval '12 minutes' as updated_at
  from site_profile p
  join public.sites sites on sites.name = p.site_name
  cross join chlorination_slots slot
  cross join submitter
  cross join lateral (
    select
      floor(extract(epoch from (slot.slot_datetime - (date_trunc('day', now()) - interval '89 days'))) / 86400)::numeric as days_since_start,
      case extract(hour from slot.slot_datetime)
        when 0 then 0.78::numeric
        when 8 then 1.12::numeric
        else 1.00::numeric
      end as demand_factor,
      case extract(hour from slot.slot_datetime)
        when 0 then 0::numeric
        when 8 then 1::numeric
        else 2::numeric
      end as shift_factor
  ) calc
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
from chlorination_seed
on conflict (site_id, slot_datetime) do update
set
  reading_datetime = excluded.reading_datetime,
  status = excluded.status,
  remarks = excluded.remarks,
  totalizer = excluded.totalizer,
  pressure_psi = excluded.pressure_psi,
  rc_ppm = excluded.rc_ppm,
  turbidity_ntu = excluded.turbidity_ntu,
  ph = excluded.ph,
  tds_ppm = excluded.tds_ppm,
  tank_level_liters = excluded.tank_level_liters,
  flowrate_m3hr = excluded.flowrate_m3hr,
  chlorine_consumed = excluded.chlorine_consumed,
  peroxide_consumption = excluded.peroxide_consumption,
  chlorination_power_kwh = excluded.chlorination_power_kwh,
  updated_at = excluded.updated_at;

with submitter as (
  select id
  from public.profiles
  order by
    case when role = 'operator' and is_approved then 0 else 1 end,
    created_at
  limit 1
),
site_profile as (
  select *
  from (
    values
      ('Deepwell Station 1'::text, 43::numeric, 37::numeric, 31::numeric, 43::numeric, 224::numeric, 22::numeric, 268::numeric, 36::numeric),
      ('Deepwell Station 2'::text, 39::numeric, 34::numeric, 24::numeric, 39::numeric, 232::numeric, 18::numeric, 312::numeric, 29::numeric)
  ) as p(
    site_name,
    upstream_base,
    downstream_base,
    flow_base,
    frequency_base,
    voltage_base,
    amperage_base,
    tds_base,
    power_shift_base
  )
),
deepwell_slots as (
  select
    generate_series(
      date_trunc('day', now()) - interval '89 days',
      date_trunc('day', now()) + interval '18 hours',
      interval '6 hours'
    ) as slot_datetime
),
deepwell_seed as (
  select
    gen_random_uuid() as id,
    sites.id as site_id,
    submitter.id as submitted_by,
    slot.slot_datetime + interval '7 minutes' + (random() * interval '10 minutes') as reading_datetime,
    slot.slot_datetime,
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
    round((p.upstream_base + demand_factor * 1.8 + random()::numeric * 1.8 - 0.9)::numeric, 2) as upstream_pressure_psi,
    round((p.downstream_base + demand_factor * 1.5 + random()::numeric * 1.6 - 0.8)::numeric, 2) as downstream_pressure_psi,
    round(greatest(6, (p.flow_base + demand_factor * 2.8 + (sin((days_since_start / 11.0)::double precision) * 1.2)::numeric + random()::numeric * 1.8 - 0.9))::numeric, 2) as flowrate_m3hr,
    round(greatest(20, (p.frequency_base + demand_factor * 2.5 + random()::numeric * 1.6 - 0.8))::numeric, 2) as vfd_frequency_hz,
    round((p.voltage_base + random()::numeric * 5 - 2.5)::numeric, 2) as voltage_l1_v,
    round((p.voltage_base + random()::numeric * 5 - 2.5)::numeric, 2) as voltage_l2_v,
    round((p.voltage_base + random()::numeric * 5 - 2.5)::numeric, 2) as voltage_l3_v,
    round((p.amperage_base + demand_factor * 1.4 + random()::numeric * 1.6 - 0.8)::numeric, 2) as amperage_a,
    round((p.tds_base + (sin((days_since_start / 14.0)::double precision) * 10)::numeric + random()::numeric * 12 - 6)::numeric, 2) as tds_ppm,
    round(greatest(4, (p.power_shift_base + demand_factor * 3.2 + random()::numeric * 2.2 - 1.1))::numeric, 2) as power_kwh_shift,
    slot.slot_datetime + interval '15 minutes' as created_at,
    slot.slot_datetime + interval '15 minutes' as updated_at
  from site_profile p
  join public.sites sites on sites.name = p.site_name
  cross join deepwell_slots slot
  cross join submitter
  cross join lateral (
    select
      floor(extract(epoch from (slot.slot_datetime - (date_trunc('day', now()) - interval '89 days'))) / 86400)::numeric as days_since_start,
      case extract(hour from slot.slot_datetime)
        when 0 then 0.72::numeric
        when 6 then 1.08::numeric
        when 12 then 1.18::numeric
        else 0.96::numeric
      end as demand_factor
  ) calc
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
from deepwell_seed
on conflict (site_id, slot_datetime) do update
set
  reading_datetime = excluded.reading_datetime,
  status = excluded.status,
  remarks = excluded.remarks,
  upstream_pressure_psi = excluded.upstream_pressure_psi,
  downstream_pressure_psi = excluded.downstream_pressure_psi,
  flowrate_m3hr = excluded.flowrate_m3hr,
  vfd_frequency_hz = excluded.vfd_frequency_hz,
  voltage_l1_v = excluded.voltage_l1_v,
  voltage_l2_v = excluded.voltage_l2_v,
  voltage_l3_v = excluded.voltage_l3_v,
  amperage_a = excluded.amperage_a,
  tds_ppm = excluded.tds_ppm,
  power_kwh_shift = excluded.power_kwh_shift,
  updated_at = excluded.updated_at;
