-- Reset dashboard operational data before feeding fake demo data.
--
-- WARNING:
--   This deletes readings, audit logs, site assignments, and sites from public tables.
--   It intentionally keeps auth users and public.profiles so you can still sign in.
--
-- Recommended flow:
--   1. Run this file in the Supabase SQL editor.
--   2. Run seed-dashboard-demo-data.sql in the Supabase SQL editor.

truncate table
  public.reading_audit_log,
  public.readings,
  public.chlorination_readings,
  public.deepwell_readings,
  public.site_assignments,
  public.sites
restart identity cascade;
