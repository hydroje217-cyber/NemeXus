-- Verify the dashboard Total Chlorine value against the database.
--
-- This is read-only. It starts a transaction and rolls it back at the end.
-- The app's Monthly Chemical Usage card computes Total Chlorine by summing
-- public.chlorination_readings.chlorine_consumed for the visible 10-month range.
--
-- Important:
--   - This matches the app behavior by using all reading statuses.
--   - It groups by the reading day from slot_datetime first, then reading_datetime,
--     then created_at, because that is the app's fallback order.

begin;

with params as (
  select
    date_trunc('month', current_date)::date - interval '9 months' as visible_from_date,
    current_date::date as visible_to_date
),
source_readings as (
  select
    id,
    site_id,
    status,
    coalesce(slot_datetime, reading_datetime, created_at)::date as reading_day,
    coalesce(chlorine_consumed, 0)::numeric as chlorine_consumed
  from public.chlorination_readings
  where coalesce(slot_datetime, reading_datetime, created_at)::date between
    (select visible_from_date from params)
    and (select visible_to_date from params)
),
monthly_totals as (
  select
    to_char(date_trunc('month', reading_day), 'YYYY-MM') as month_key,
    to_char(date_trunc('month', reading_day), 'Mon-YY') as month_label,
    round(sum(chlorine_consumed)::numeric, 2) as chlorine_total,
    count(*) as reading_count
  from source_readings
  group by date_trunc('month', reading_day)
),
dashboard_total as (
  select
    round(coalesce(sum(chlorine_total), 0)::numeric, 2) as total_chlorine
  from monthly_totals
)
select
  month_key,
  month_label,
  chlorine_total,
  reading_count
from monthly_totals
order by month_key desc;

with params as (
  select
    date_trunc('month', current_date)::date - interval '9 months' as visible_from_date,
    current_date::date as visible_to_date
),
source_readings as (
  select
    coalesce(slot_datetime, reading_datetime, created_at)::date as reading_day,
    coalesce(chlorine_consumed, 0)::numeric as chlorine_consumed
  from public.chlorination_readings
  where coalesce(slot_datetime, reading_datetime, created_at)::date between
    (select visible_from_date from params)
    and (select visible_to_date from params)
),
monthly_totals as (
  select
    date_trunc('month', reading_day) as month_key,
    sum(chlorine_consumed)::numeric as chlorine_total
  from source_readings
  group by date_trunc('month', reading_day)
)
select
  (select visible_from_date from params) as visible_from_date,
  (select visible_to_date from params) as visible_to_date,
  round(coalesce(sum(chlorine_total), 0)::numeric, 2) as dashboard_total_chlorine
from monthly_totals;

rollback;

