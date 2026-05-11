-- Fill yesterday's 48 half-hour slots with fake readings for export testing.
-- Run this in the Supabase SQL Editor. It uses the app's UTC+8 operating day.
-- Existing rows for the same site/time slot are updated so the script is repeatable.

do $$
declare
  seed_user_id uuid;
  local_seed_date date := (timezone('Asia/Manila', now())::date - 1);
begin
  select id
  into seed_user_id
  from public.profiles
  where is_active = true
    and (is_approved = true or role in ('admin', 'manager', 'supervisor'))
  order by
    case role
      when 'admin' then 1
      when 'manager' then 2
      when 'supervisor' then 3
      else 4
    end,
    created_at asc
  limit 1;

  if seed_user_id is null then
    raise exception 'No approved/office profile found. Approve one user first, then run this seed.';
  end if;

  insert into public.chlorination_readings (
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
    chlorination_power_kwh
  )
  select
    sites.id,
    seed_user_id,
    slot_at + interval '7 minutes',
    slot_at,
    'submitted',
    'Fake export test data',
    round((12500 + sites.id * 100 + slot_index * 7.5)::numeric, 2),
    round((42 + (slot_index % 8) * 0.7)::numeric, 2),
    round((0.45 + (slot_index % 6) * 0.05)::numeric, 2),
    round((0.8 + (slot_index % 5) * 0.08)::numeric, 2),
    round((7.15 + (slot_index % 4) * 0.03)::numeric, 2),
    round((118 + (slot_index % 12) * 2.2)::numeric, 2),
    round((7200 - slot_index * 18 + sites.id * 5)::numeric, 2),
    round((82 + (slot_index % 10) * 1.4)::numeric, 2),
    round((1.1 + (slot_index % 4) * 0.18)::numeric, 2),
    round((0.55 + (slot_index % 3) * 0.12)::numeric, 2),
    round((14 + (slot_index % 8) * 0.9)::numeric, 2)
  from public.sites
  cross join lateral (
    select
      series_index as slot_index,
      ((local_seed_date::timestamp + make_interval(mins => series_index * 30)) at time zone 'Asia/Manila') as slot_at
    from generate_series(0, 47) as series_index
  ) slots
  where sites.type = 'CHLORINATION'
  on conflict (site_id, slot_datetime)
  do update set
    submitted_by = excluded.submitted_by,
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
    updated_at = timezone('utc', now());

  insert into public.deepwell_readings (
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
    power_kwh_shift
  )
  select
    sites.id,
    seed_user_id,
    slot_at + interval '6 minutes',
    slot_at,
    'submitted',
    'Fake export test data',
    round((38 + (slot_index % 7) * 0.8)::numeric, 2),
    round((54 + (slot_index % 7) * 0.9)::numeric, 2),
    round((96 + (slot_index % 9) * 1.7)::numeric, 2),
    round((42 + (slot_index % 8) * 0.5)::numeric, 2),
    round((221 + (slot_index % 5) * 1.1)::numeric, 2),
    round((222 + (slot_index % 5) * 1.0)::numeric, 2),
    round((220 + (slot_index % 5) * 1.2)::numeric, 2),
    round((31 + (slot_index % 6) * 0.9)::numeric, 2),
    round((132 + (slot_index % 10) * 2.1)::numeric, 2),
    round((24 + (slot_index % 10) * 1.35)::numeric, 2)
  from public.sites
  cross join lateral (
    select
      series_index as slot_index,
      ((local_seed_date::timestamp + make_interval(mins => series_index * 30)) at time zone 'Asia/Manila') as slot_at
    from generate_series(0, 47) as series_index
  ) slots
  where sites.type = 'DEEPWELL'
  on conflict (site_id, slot_datetime)
  do update set
    submitted_by = excluded.submitted_by,
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
    updated_at = timezone('utc', now());

  raise notice 'Seeded fake export readings for local date % using submitted_by %.', local_seed_date, seed_user_id;
end $$;

select
  'chlorination_readings' as table_name,
  count(*) as seeded_rows
from public.chlorination_readings
where slot_datetime >= (((timezone('Asia/Manila', now())::date - 1)::timestamp) at time zone 'Asia/Manila')
  and slot_datetime < ((timezone('Asia/Manila', now())::date::timestamp) at time zone 'Asia/Manila')
union all
select
  'deepwell_readings' as table_name,
  count(*) as seeded_rows
from public.deepwell_readings
where slot_datetime >= (((timezone('Asia/Manila', now())::date - 1)::timestamp) at time zone 'Asia/Manila')
  and slot_datetime < ((timezone('Asia/Manila', now())::date::timestamp) at time zone 'Asia/Manila');
