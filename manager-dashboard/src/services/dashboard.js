import { supabase } from '../lib/supabase';
import {
  buildDailyPowerConsumption,
  buildDailyProduction,
  buildMonthlyPowerConsumption,
  buildMonthlyProduction,
  startOfMonthlyProductionSourceIso,
} from '../utils/production';

const OFFICE_ROLES = new Set(['manager', 'supervisor', 'admin']);

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

function sortByCreatedAtDesc(a, b) {
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
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

export async function getDashboardSnapshot({ limit = 14 } = {}) {
  const todayIso = startOfTodayIso();

  const [
    pendingApprovals,
    totalOperators,
    approvedOperators,
    sitesCount,
    todayChlorination,
    todayDeepwell,
    recentChlorination,
    recentDeepwell,
    profiles,
    monthlyChlorination,
    monthlyDeepwell,
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
    supabase.from('chlorination_readings').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
    supabase.from('deepwell_readings').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
    supabase
      .from('chlorination_readings')
      .select(
        'id, status, created_at, reading_datetime, totalizer, rc_ppm, ph, site:sites(name, type), submitted_profile:profiles!chlorination_readings_submitted_by_fkey(full_name, email)'
      )
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('deepwell_readings')
      .select(
        'id, status, created_at, reading_datetime, flowrate_m3hr, tds_ppm, power_kwh_shift, site:sites(name, type), submitted_profile:profiles!deepwell_readings_submitted_by_fkey(full_name, email)'
      )
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, is_approved, approved_at, created_at')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('chlorination_readings')
      .select('id, status, created_at, reading_datetime, slot_datetime, totalizer, chlorination_power_kwh')
      .gte('reading_datetime', startOfMonthlyProductionSourceIso())
      .order('reading_datetime', { ascending: true }),
    supabase
      .from('deepwell_readings')
      .select('id, status, created_at, reading_datetime, slot_datetime, power_kwh_shift')
      .gte('reading_datetime', startOfMonthlyProductionSourceIso())
      .order('reading_datetime', { ascending: true }),
  ]);

  throwIfError(pendingApprovals, 'Failed to load pending approvals.');
  throwIfError(totalOperators, 'Failed to count operators.');
  throwIfError(approvedOperators, 'Failed to count approved operators.');
  throwIfError(sitesCount, 'Failed to count sites.');
  throwIfError(todayChlorination, 'Failed to count chlorination readings.');
  throwIfError(todayDeepwell, 'Failed to count deepwell readings.');
  throwIfError(recentChlorination, 'Failed to load recent chlorination readings.');
  throwIfError(recentDeepwell, 'Failed to load recent deepwell readings.');
  throwIfError(profiles, 'Failed to load accounts.');
  throwIfError(monthlyChlorination, 'Failed to load monthly chlorination production.');
  throwIfError(monthlyDeepwell, 'Failed to load monthly deepwell power consumption.');

  const recentReadings = [
    ...(recentChlorination.data ?? []).map((row) => normalizeReading(row, 'CHLORINATION')),
    ...(recentDeepwell.data ?? []).map((row) => normalizeReading(row, 'DEEPWELL')),
  ]
    .sort(sortByCreatedAtDesc)
    .slice(0, limit);

  return {
    stats: {
      totalOperators: totalOperators.count ?? 0,
      approvedOperators: approvedOperators.count ?? 0,
      pendingOperators: pendingApprovals.data?.length ?? 0,
      totalSites: sitesCount.count ?? 0,
      todayReadings: (todayChlorination.count ?? 0) + (todayDeepwell.count ?? 0),
    },
    pendingApprovals: pendingApprovals.data ?? [],
    recentReadings,
    profiles: profiles.data ?? [],
    monthlyProduction: buildMonthlyProduction(monthlyChlorination.data ?? []),
    dailyProduction: buildDailyProduction(monthlyChlorination.data ?? []),
    monthlyPowerConsumption: buildMonthlyPowerConsumption({
      chlorinationReadings: monthlyChlorination.data ?? [],
      deepwellReadings: monthlyDeepwell.data ?? [],
    }),
    dailyPowerConsumption: buildDailyPowerConsumption({
      chlorinationReadings: monthlyChlorination.data ?? [],
      deepwellReadings: monthlyDeepwell.data ?? [],
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
