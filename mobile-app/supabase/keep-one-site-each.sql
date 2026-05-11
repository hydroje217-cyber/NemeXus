-- Keep only one Chlorination site and one Deepwell site.
--
-- Run this in the Supabase SQL editor if your current database already has
-- extra demo sites. It keeps auth users and profiles.

insert into public.sites (name, type)
values
  ('Main Chlorination Facility', 'CHLORINATION'),
  ('Main Deepwell Pump', 'DEEPWELL')
on conflict (name) do update
set type = excluded.type;

with kept_sites as (
  select id
  from public.sites
  where name in ('Main Chlorination Facility', 'Main Deepwell Pump')
),
extra_sites as (
  select id
  from public.sites
  where id not in (select id from kept_sites)
),
deleted_audit as (
  delete from public.reading_audit_log log
  using public.readings reading
  where log.reading_id = reading.id
    and reading.site_id in (select id from extra_sites)
  returning log.id
),
deleted_legacy_readings as (
  delete from public.readings
  where site_id in (select id from extra_sites)
  returning id
),
deleted_chlorination_readings as (
  delete from public.chlorination_readings
  where site_id in (select id from extra_sites)
  returning id
),
deleted_deepwell_readings as (
  delete from public.deepwell_readings
  where site_id in (select id from extra_sites)
  returning id
),
deleted_assignments as (
  delete from public.site_assignments
  where site_id in (select id from extra_sites)
  returning id
)
delete from public.sites
where id in (select id from extra_sites);

