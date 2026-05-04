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

function applyReadingFilters(query, { siteId, fromDate, toDate, limit }) {
  let nextQuery = query.order('reading_datetime', { ascending: false });

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    nextQuery = nextQuery.limit(limit);
  }

  if (siteId) {
    nextQuery = nextQuery.eq('site_id', siteId);
  }

  if (fromDate) {
    const start = new Date(`${fromDate}T00:00:00`);
    nextQuery = nextQuery.gte('reading_datetime', start.toISOString());
  }

  if (toDate) {
    const end = new Date(`${toDate}T00:00:00`);
    end.setDate(end.getDate() + 1);
    nextQuery = nextQuery.lt('reading_datetime', end.toISOString());
  }

  return nextQuery;
}

function buildChlorinationPayload(payload) {
  const {
    site_type,
    upstream_pressure_psi,
    downstream_pressure_psi,
    vfd_frequency_hz,
    voltage_l1_v,
    voltage_l2_v,
    voltage_l3_v,
    amperage_a,
    power_kwh_shift,
    ...chlorinationPayload
  } = payload;

  return chlorinationPayload;
}

function buildDeepwellPayload(payload) {
  const {
    site_type,
    totalizer,
    pressure_psi,
    rc_ppm,
    turbidity_ntu,
    ph,
    tank_level_liters,
    chlorine_consumed,
    peroxide_consumption,
    chlorination_power_kwh,
    ...deepwellPayload
  } = payload;

  return deepwellPayload;
}

export async function createReading(payload) {
  const tableName = payload?.site_type === 'CHLORINATION' ? 'chlorination_readings' : 'deepwell_readings';
  const tablePayload =
    payload?.site_type === 'CHLORINATION'
      ? buildChlorinationPayload(payload)
      : buildDeepwellPayload(payload);

  const { data, error } = await supabase
    .from(tableName)
    .insert(tablePayload)
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listReadings({ siteId, siteType, fromDate, toDate, limit }) {
  if (siteType === 'CHLORINATION') {
    const { data, error } = await applyReadingFilters(
      supabase.from('chlorination_readings').select(CHLORINATION_SELECT),
      { siteId, fromDate, toDate, limit }
    );

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => normalizeReading(row, 'CHLORINATION'));
  }

  if (siteType === 'DEEPWELL') {
    const { data, error } = await applyReadingFilters(
      supabase.from('deepwell_readings').select(DEEPWELL_SELECT),
      { siteId, fromDate, toDate, limit }
    );

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => normalizeReading(row, 'DEEPWELL'));
  }

  const [chlorinationResult, deepwellResult] = await Promise.all([
    applyReadingFilters(
      supabase.from('chlorination_readings').select(CHLORINATION_SELECT),
      { siteId, fromDate, toDate, limit }
    ),
    applyReadingFilters(
      supabase.from('deepwell_readings').select(DEEPWELL_SELECT),
      { siteId, fromDate, toDate, limit }
    ),
  ]);

  if (chlorinationResult.error) {
    throw chlorinationResult.error;
  }

  if (deepwellResult.error) {
    throw deepwellResult.error;
  }

  return [
    ...(chlorinationResult.data ?? []).map((row) => normalizeReading(row, 'CHLORINATION')),
    ...(deepwellResult.data ?? []).map((row) => normalizeReading(row, 'DEEPWELL')),
  ]
    .sort((a, b) => new Date(b.reading_datetime || 0).getTime() - new Date(a.reading_datetime || 0).getTime())
    .slice(0, typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined);
}
