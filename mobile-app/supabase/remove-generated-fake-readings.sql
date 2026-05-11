-- Remove generated demo/test readings without deleting real sites, profiles,
-- site assignments, or imported daily_site_summaries.
--
-- Targets rows created by:
--   - seed-dashboard-demo-data.sql
--   - refresh-main-facility-demo-data.sql
--   - seed-yesterday-full-test-readings.sql
--
-- This intentionally matches known generated remarks only.

with deleted_chlorination as (
  delete from public.chlorination_readings
  where coalesce(remarks, '') in (
    'Fake export test data',
    'Low residual follow-up',
    'Pump changeover noted',
    'Manual verification requested',
    'Routine shift reading'
  )
  returning id
),
deleted_deepwell as (
  delete from public.deepwell_readings
  where coalesce(remarks, '') in (
    'Fake export test data',
    'Backwash completed before reading',
    'Voltage imbalance monitored',
    'Flow verified at panel',
    'Routine shift reading'
  )
  returning id
)
select
  (select count(*) from deleted_chlorination) as deleted_chlorination_readings,
  (select count(*) from deleted_deepwell) as deleted_deepwell_readings,
  (select count(*) from public.chlorination_readings) as remaining_chlorination_readings,
  (select count(*) from public.deepwell_readings) as remaining_deepwell_readings,
  (select count(*) from public.daily_site_summaries) as preserved_daily_summaries;
