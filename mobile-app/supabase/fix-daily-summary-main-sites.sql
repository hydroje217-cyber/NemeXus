do $$
declare
  main_chlorination_id bigint;
  extra_chlorination_id bigint;
  main_deepwell_id bigint;
  extra_deepwell_id bigint;
begin
  insert into public.sites (name, type)
  values
    ('Main Chlorination Facility', 'CHLORINATION'),
    ('Main Deepwell Pump', 'DEEPWELL')
  on conflict (name) do nothing;

  select id into main_chlorination_id
  from public.sites
  where name = 'Main Chlorination Facility'
    and type = 'CHLORINATION';

  select id into extra_chlorination_id
  from public.sites
  where name = 'Chlorination House'
    and type = 'CHLORINATION';

  select id into main_deepwell_id
  from public.sites
  where name = 'Main Deepwell Pump'
    and type = 'DEEPWELL';

  select id into extra_deepwell_id
  from public.sites
  where name = 'Deepwell House'
    and type = 'DEEPWELL';

  if extra_chlorination_id is not null then
    insert into public.daily_site_summaries (
      site_id,
      summary_date,
      source,
      source_file,
      production_m3,
      power_kwh,
      chlorine_kg,
      avg_flowrate_m3hr,
      avg_pressure_psi,
      avg_rc_ppm,
      avg_turbidity_ntu,
      avg_ph,
      avg_tds_ppm,
      peroxide_liters,
      operating_hours,
      scheduled_downtime_hours,
      unscheduled_downtime_hours,
      avg_upstream_pressure_psi,
      avg_downstream_pressure_psi,
      avg_vfd_frequency_hz,
      avg_voltage_l1_v,
      avg_voltage_l2_v,
      avg_voltage_l3_v,
      avg_amperage_a
    )
    select
      main_chlorination_id,
      summary_date,
      source,
      source_file,
      production_m3,
      power_kwh,
      chlorine_kg,
      avg_flowrate_m3hr,
      avg_pressure_psi,
      avg_rc_ppm,
      avg_turbidity_ntu,
      avg_ph,
      avg_tds_ppm,
      peroxide_liters,
      operating_hours,
      scheduled_downtime_hours,
      unscheduled_downtime_hours,
      avg_upstream_pressure_psi,
      avg_downstream_pressure_psi,
      avg_vfd_frequency_hz,
      avg_voltage_l1_v,
      avg_voltage_l2_v,
      avg_voltage_l3_v,
      avg_amperage_a
    from public.daily_site_summaries
    where site_id = extra_chlorination_id
    on conflict (site_id, summary_date) do update
    set
      source = excluded.source,
      source_file = excluded.source_file,
      production_m3 = excluded.production_m3,
      power_kwh = excluded.power_kwh,
      chlorine_kg = excluded.chlorine_kg,
      avg_flowrate_m3hr = excluded.avg_flowrate_m3hr,
      avg_pressure_psi = excluded.avg_pressure_psi,
      avg_rc_ppm = excluded.avg_rc_ppm,
      avg_turbidity_ntu = excluded.avg_turbidity_ntu,
      avg_ph = excluded.avg_ph,
      avg_tds_ppm = excluded.avg_tds_ppm,
      peroxide_liters = excluded.peroxide_liters,
      operating_hours = excluded.operating_hours,
      scheduled_downtime_hours = excluded.scheduled_downtime_hours,
      unscheduled_downtime_hours = excluded.unscheduled_downtime_hours,
      updated_at = timezone('utc', now());

    delete from public.daily_site_summaries where site_id = extra_chlorination_id;
  end if;

  if extra_deepwell_id is not null then
    insert into public.daily_site_summaries (
      site_id,
      summary_date,
      source,
      source_file,
      production_m3,
      power_kwh,
      chlorine_kg,
      avg_flowrate_m3hr,
      avg_pressure_psi,
      avg_rc_ppm,
      avg_turbidity_ntu,
      avg_ph,
      avg_tds_ppm,
      peroxide_liters,
      operating_hours,
      scheduled_downtime_hours,
      unscheduled_downtime_hours,
      avg_upstream_pressure_psi,
      avg_downstream_pressure_psi,
      avg_vfd_frequency_hz,
      avg_voltage_l1_v,
      avg_voltage_l2_v,
      avg_voltage_l3_v,
      avg_amperage_a
    )
    select
      main_deepwell_id,
      summary_date,
      source,
      source_file,
      production_m3,
      power_kwh,
      chlorine_kg,
      avg_flowrate_m3hr,
      avg_pressure_psi,
      avg_rc_ppm,
      avg_turbidity_ntu,
      avg_ph,
      avg_tds_ppm,
      peroxide_liters,
      operating_hours,
      scheduled_downtime_hours,
      unscheduled_downtime_hours,
      avg_upstream_pressure_psi,
      avg_downstream_pressure_psi,
      avg_vfd_frequency_hz,
      avg_voltage_l1_v,
      avg_voltage_l2_v,
      avg_voltage_l3_v,
      avg_amperage_a
    from public.daily_site_summaries
    where site_id = extra_deepwell_id
    on conflict (site_id, summary_date) do update
    set
      source = excluded.source,
      source_file = excluded.source_file,
      power_kwh = excluded.power_kwh,
      avg_upstream_pressure_psi = excluded.avg_upstream_pressure_psi,
      avg_downstream_pressure_psi = excluded.avg_downstream_pressure_psi,
      avg_vfd_frequency_hz = excluded.avg_vfd_frequency_hz,
      avg_voltage_l1_v = excluded.avg_voltage_l1_v,
      avg_voltage_l2_v = excluded.avg_voltage_l2_v,
      avg_voltage_l3_v = excluded.avg_voltage_l3_v,
      avg_amperage_a = excluded.avg_amperage_a,
      avg_tds_ppm = excluded.avg_tds_ppm,
      updated_at = timezone('utc', now());

    delete from public.daily_site_summaries where site_id = extra_deepwell_id;
  end if;

  delete from public.sites
  where name in ('Chlorination House', 'Deepwell House')
    and not exists (
      select 1
      from public.daily_site_summaries
      where daily_site_summaries.site_id = sites.id
    )
    and not exists (
      select 1
      from public.site_assignments
      where site_assignments.site_id = sites.id
    )
    and not exists (
      select 1
      from public.chlorination_readings
      where chlorination_readings.site_id = sites.id
    )
    and not exists (
      select 1
      from public.deepwell_readings
      where deepwell_readings.site_id = sites.id
    );
end $$;
