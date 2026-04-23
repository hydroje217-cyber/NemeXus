import { supabase } from '../lib/supabase';

export async function createReading(payload) {
  const { data, error } = await supabase
    .from('readings')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listReadings({ siteId, siteType, fromDate, toDate, limit }) {
  let query = supabase
    .from('readings')
    .select(
      'id, site_id, site_type, reading_datetime, slot_datetime, created_at, remarks, totalizer, pressure_psi, rc_ppm, turbidity_ntu, ph, tds_ppm, tank_level_liters, flowrate_m3hr, chlorine_consumed, upstream_pressure_psi, downstream_pressure_psi, vfd_frequency_hz, voltage_l1_v, voltage_l2_v, voltage_l3_v, amperage_a, power_kwh_shift, status, sites(id, name, type), submitted_profile:profiles!readings_submitted_by_fkey(full_name, email)'
    )
    .order('reading_datetime', { ascending: false });

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    query = query.limit(limit);
  }

  if (siteId) {
    query = query.eq('site_id', siteId);
  }

  if (siteType) {
    query = query.eq('site_type', siteType);
  }

  if (fromDate) {
    const start = new Date(`${fromDate}T00:00:00`);
    query = query.gte('reading_datetime', start.toISOString());
  }

  if (toDate) {
    const end = new Date(`${toDate}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query = query.lt('reading_datetime', end.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}
