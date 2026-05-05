import { supabase } from '../lib/supabase';

const CHLORINATION_SELECT =
  'id, site_id, reading_datetime, slot_datetime, created_at, remarks, totalizer, pressure_psi, rc_ppm, turbidity_ntu, ph, tds_ppm, tank_level_liters, flowrate_m3hr, chlorine_consumed, peroxide_consumption, chlorination_power_kwh, status, sites(id, name, type), submitted_profile:profiles!chlorination_readings_submitted_by_fkey(full_name, email)';

const DEEPWELL_SELECT =
  'id, site_id, reading_datetime, slot_datetime, created_at, remarks, upstream_pressure_psi, downstream_pressure_psi, flowrate_m3hr, vfd_frequency_hz, voltage_l1_v, voltage_l2_v, voltage_l3_v, amperage_a, tds_ppm, power_kwh_shift, status, sites(id, name, type), submitted_profile:profiles!deepwell_readings_submitted_by_fkey(full_name, email)';

function normalizeReading(row, siteType) {
  return {
    ...row,
    site_type: siteType,
  };
}

function applyReadingFilters(query, { fromDate, toDate, limit }) {
  let nextQuery = query.order('reading_datetime', { ascending: false });

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    nextQuery = nextQuery.limit(limit);
  }

  if (fromDate) {
    nextQuery = nextQuery.gte('reading_datetime', new Date(`${fromDate}T00:00:00`).toISOString());
  }

  if (toDate) {
    const end = new Date(`${toDate}T00:00:00`);
    end.setDate(end.getDate() + 1);
    nextQuery = nextQuery.lt('reading_datetime', end.toISOString());
  }

  return nextQuery;
}

export async function listReadings({ siteType, fromDate, toDate, limit }) {
  if (siteType === 'CHLORINATION') {
    const { data, error } = await applyReadingFilters(
      supabase.from('chlorination_readings').select(CHLORINATION_SELECT),
      { fromDate, toDate, limit }
    );

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => normalizeReading(row, 'CHLORINATION'));
  }

  if (siteType === 'DEEPWELL') {
    const { data, error } = await applyReadingFilters(
      supabase.from('deepwell_readings').select(DEEPWELL_SELECT),
      { fromDate, toDate, limit }
    );

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => normalizeReading(row, 'DEEPWELL'));
  }

  return [];
}
