import { supabase } from '../lib/supabase';

const DAILY_SUMMARY_SELECT =
  'id, site_id, summary_date, source, source_file, production_m3, power_kwh, chlorine_kg, avg_flowrate_m3hr, avg_pressure_psi, avg_rc_ppm, avg_turbidity_ntu, avg_ph, avg_tds_ppm, peroxide_liters, operating_hours, scheduled_downtime_hours, unscheduled_downtime_hours, avg_upstream_pressure_psi, avg_downstream_pressure_psi, avg_vfd_frequency_hz, avg_voltage_l1_v, avg_voltage_l2_v, avg_voltage_l3_v, avg_amperage_a, created_at, updated_at, sites!inner(id, name, type)';

function summaryDateToIso(summaryDate) {
  return summaryDate ? `${summaryDate}T00:00:00.000Z` : null;
}

function normalizeReading(row, siteType) {
  return {
    ...row,
    site_type: siteType,
  };
}

function normalizeDailySummary(row, siteType) {
  const readingDate = summaryDateToIso(row.summary_date) || row.created_at;

  return normalizeReading(
    {
      ...row,
      is_daily_summary: true,
      reading_datetime: readingDate,
      slot_datetime: readingDate,
      remarks: row.source_file || row.source || '',
      status: row.source || 'daily summary',
      totalizer: row.production_m3,
      pressure_psi: row.avg_pressure_psi,
      rc_ppm: row.avg_rc_ppm,
      turbidity_ntu: row.avg_turbidity_ntu,
      ph: row.avg_ph,
      tds_ppm: row.avg_tds_ppm,
      flowrate_m3hr: row.avg_flowrate_m3hr,
      chlorine_consumed: row.chlorine_kg,
      peroxide_consumption: row.peroxide_liters,
      chlorination_power_kwh: row.power_kwh,
      upstream_pressure_psi: row.avg_upstream_pressure_psi,
      downstream_pressure_psi: row.avg_downstream_pressure_psi,
      vfd_frequency_hz: row.avg_vfd_frequency_hz,
      voltage_l1_v: row.avg_voltage_l1_v,
      voltage_l2_v: row.avg_voltage_l2_v,
      voltage_l3_v: row.avg_voltage_l3_v,
      amperage_a: row.avg_amperage_a,
      power_kwh_shift: row.power_kwh,
      submitted_profile: null,
    },
    siteType
  );
}

function applyReadingFilters(query, { fromDate, toDate, limit }) {
  let nextQuery = query.order('summary_date', { ascending: false });

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    nextQuery = nextQuery.limit(limit);
  }

  if (fromDate) {
    nextQuery = nextQuery.gte('summary_date', fromDate);
  }

  if (toDate) {
    nextQuery = nextQuery.lte('summary_date', toDate);
  }

  return nextQuery;
}

export async function listReadings({ siteType, fromDate, toDate, limit }) {
  if (siteType === 'CHLORINATION' || siteType === 'DEEPWELL') {
    const { data, error } = await applyReadingFilters(
      supabase.from('daily_site_summaries').select(DAILY_SUMMARY_SELECT).eq('sites.type', siteType),
      { fromDate, toDate, limit }
    );

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => normalizeDailySummary(row, siteType));
  }

  return [];
}
