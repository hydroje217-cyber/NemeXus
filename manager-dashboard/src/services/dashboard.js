import { supabase } from '../lib/supabase';
import {
  buildDailyPowerConsumption,
  buildDailyProduction,
  buildMonthlyChemicalUsage,
  buildMonthlyPowerConsumption,
  buildMonthlyProduction,
  startOfMonthlyProductionSourceIso,
} from '../utils/production';

const OFFICE_ROLES = new Set(['manager', 'supervisor', 'admin']);

const DAILY_SUMMARY_SELECT =
  'id, site_id, summary_date, source, source_file, production_m3, power_kwh, chlorine_kg, avg_flowrate_m3hr, avg_pressure_psi, avg_rc_ppm, avg_turbidity_ntu, avg_ph, avg_tds_ppm, peroxide_liters, operating_hours, scheduled_downtime_hours, unscheduled_downtime_hours, avg_upstream_pressure_psi, avg_downstream_pressure_psi, avg_vfd_frequency_hz, avg_voltage_l1_v, avg_voltage_l2_v, avg_voltage_l3_v, avg_amperage_a, created_at, updated_at, site:sites!inner(id, name, type)';

function startOfTodayIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function normalizeReading(row, siteType) {
  return {
    ...row,
    site_type: siteType,
  };
}

function summaryDateToIso(summaryDate) {
  return summaryDate ? `${summaryDate}T00:00:00.000Z` : null;
}

function normalizeDailySummary(row) {
  const siteType = row.site?.type || 'CHLORINATION';
  const readingDate = summaryDateToIso(row.summary_date) || row.created_at;

  return normalizeReading(
    {
      ...row,
      is_daily_summary: true,
      reading_datetime: readingDate,
      slot_datetime: readingDate,
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

function sortByCreatedAtDesc(a, b) {
  return (
    new Date(b.slot_datetime || b.reading_datetime || b.created_at || 0).getTime() -
    new Date(a.slot_datetime || a.reading_datetime || a.created_at || 0).getTime()
  );
}

function throwIfError(result, message) {
  if (result.error) {
    throw new Error(result.error.message || message);
  }
}

export function isOfficeRole(role) {
  return OFFICE_ROLES.has(role);
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, is_approved, approved_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load your profile.');
  }

  return data;
}

export async function getDashboardSnapshot({ limit = 50 } = {}) {
  const todayIso = startOfTodayIso();

  const [
    pendingApprovals,
    totalOperators,
    approvedOperators,
    sitesCount,
    todaySummaries,
    recentSummaries,
    profiles,
    operators,
    monthlySummaries,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, is_approved, created_at')
      .eq('role', 'operator')
      .eq('is_active', true)
      .eq('is_approved', false)
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'operator'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'operator')
      .eq('is_active', true)
      .eq('is_approved', true),
    supabase.from('sites').select('id', { count: 'exact', head: true }),
    supabase
      .from('daily_site_summaries')
      .select('id', { count: 'exact', head: true })
      .gte('summary_date', todayIso.slice(0, 10)),
    supabase
      .from('daily_site_summaries')
      .select(DAILY_SUMMARY_SELECT)
      .order('summary_date', { ascending: false })
      .limit(limit),
    supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, is_approved, approved_at, created_at')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, is_approved, approved_at, created_at')
      .eq('role', 'operator')
      .order('full_name', { ascending: true, nullsFirst: false })
      .order('email', { ascending: true, nullsFirst: false }),
    supabase
      .from('daily_site_summaries')
      .select(DAILY_SUMMARY_SELECT)
      .gte('summary_date', startOfMonthlyProductionSourceIso().slice(0, 10))
      .order('summary_date', { ascending: true }),
  ]);

  throwIfError(pendingApprovals, 'Failed to load pending approvals.');
  throwIfError(totalOperators, 'Failed to count operators.');
  throwIfError(approvedOperators, 'Failed to count approved operators.');
  throwIfError(sitesCount, 'Failed to count sites.');
  throwIfError(todaySummaries, 'Failed to count daily site summaries.');
  throwIfError(recentSummaries, 'Failed to load recent daily site summaries.');
  throwIfError(profiles, 'Failed to load accounts.');
  throwIfError(operators, 'Failed to load operators.');
  throwIfError(monthlySummaries, 'Failed to load monthly daily site summaries.');

  const recentReadings = (recentSummaries.data ?? [])
    .map(normalizeDailySummary)
    .sort(sortByCreatedAtDesc)
    .slice(0, limit);
  const monthlyRows = (monthlySummaries.data ?? []).map(normalizeDailySummary);
  const monthlyChlorination = monthlyRows.filter((row) => row.site_type === 'CHLORINATION');
  const monthlyDeepwell = monthlyRows.filter((row) => row.site_type === 'DEEPWELL');

  return {
    stats: {
      totalOperators: totalOperators.count ?? 0,
      approvedOperators: approvedOperators.count ?? 0,
      pendingOperators: pendingApprovals.data?.length ?? 0,
      totalSites: sitesCount.count ?? 0,
      todayReadings: todaySummaries.count ?? 0,
    },
    pendingApprovals: pendingApprovals.data ?? [],
    recentReadings,
    profiles: profiles.data ?? [],
    operators: operators.data ?? [],
    monthlyProduction: buildMonthlyProduction(monthlyChlorination),
    dailyProduction: buildDailyProduction(monthlyChlorination),
    monthlyChemicalUsage: buildMonthlyChemicalUsage(monthlyChlorination),
    monthlyPowerConsumption: buildMonthlyPowerConsumption({
      chlorinationReadings: monthlyChlorination,
      deepwellReadings: monthlyDeepwell,
    }),
    dailyPowerConsumption: buildDailyPowerConsumption({
      chlorinationReadings: monthlyChlorination,
      deepwellReadings: monthlyDeepwell,
    }),
  };
}

export async function approveOperatorProfile(profileId) {
  const { error } = await supabase.rpc('approve_operator_account', {
    target_profile_id: profileId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to approve operator.');
  }
}

export async function assignProfileRole(profileId, nextRole) {
  const { error } = await supabase.rpc('assign_profile_role', {
    target_profile_id: profileId,
    next_role: nextRole,
  });

  if (error) {
    throw new Error(error.message || 'Failed to update role.');
  }
}

export async function deleteProfileAccount(profileId) {
  const { error } = await supabase.rpc('delete_profile_account', {
    target_profile_id: profileId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to delete account.');
  }
}
