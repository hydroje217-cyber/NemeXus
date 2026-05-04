import { supabase } from '../lib/supabase';
import {
  buildDailyProduction,
  buildMonthlyProduction,
  buildMonthlyPowerConsumption,
  startOfMonthlyProductionSourceIso,
} from '../utils/production';

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured yet.');
  }
}

function throwIfError(result, fallbackMessage) {
  if (result.error) {
    throw new Error(result.error.message || fallbackMessage);
  }
}

function startOfTodayIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

function normalizeOfficeReading(row, siteType) {
  return {
    ...row,
    site_type: siteType,
  };
}

function sortByCreatedAtDesc(a, b) {
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
}

export async function getOfficeDashboardSnapshot({ limit = 12 } = {}) {
  requireSupabase();

  const [
    pendingApprovalsResult,
    totalOperatorsResult,
    approvedOperatorsResult,
    sitesCountResult,
    todayChlorinationReadingsResult,
    todayDeepwellReadingsResult,
    recentChlorinationReadingsResult,
    recentDeepwellReadingsResult,
    profilesResult,
    monthlyChlorinationReadingsResult,
    monthlyDeepwellReadingsResult,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, is_approved, created_at')
      .eq('role', 'operator')
      .eq('is_active', true)
      .eq('is_approved', false)
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'operator'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'operator')
      .eq('is_active', true)
      .eq('is_approved', true),
    supabase.from('sites').select('id', { count: 'exact', head: true }),
    supabase
      .from('chlorination_readings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfTodayIso()),
    supabase
      .from('deepwell_readings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfTodayIso()),
    supabase
      .from('chlorination_readings')
      .select(
        'id, status, created_at, reading_datetime, slot_datetime, totalizer, site:sites(name, type), submitted_profile:profiles!chlorination_readings_submitted_by_fkey(full_name, email)'
      )
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('deepwell_readings')
      .select(
        'id, status, created_at, reading_datetime, slot_datetime, flowrate_m3hr, site:sites(name, type), submitted_profile:profiles!deepwell_readings_submitted_by_fkey(full_name, email)'
      )
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, is_approved, approved_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
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

  throwIfError(pendingApprovalsResult, 'Failed to load pending approvals.');
  throwIfError(totalOperatorsResult, 'Failed to count operators.');
  throwIfError(approvedOperatorsResult, 'Failed to count approved operators.');
  throwIfError(sitesCountResult, 'Failed to count sites.');
  throwIfError(todayChlorinationReadingsResult, 'Failed to count today chlorination readings.');
  throwIfError(todayDeepwellReadingsResult, 'Failed to count today deepwell readings.');
  throwIfError(recentChlorinationReadingsResult, 'Failed to load recent chlorination readings.');
  throwIfError(recentDeepwellReadingsResult, 'Failed to load recent deepwell readings.');
  throwIfError(profilesResult, 'Failed to load account roles.');
  throwIfError(monthlyChlorinationReadingsResult, 'Failed to load monthly chlorination production.');
  throwIfError(monthlyDeepwellReadingsResult, 'Failed to load monthly deepwell power consumption.');

  const recentReadings = [
    ...(recentChlorinationReadingsResult.data ?? []).map((row) => normalizeOfficeReading(row, 'CHLORINATION')),
    ...(recentDeepwellReadingsResult.data ?? []).map((row) => normalizeOfficeReading(row, 'DEEPWELL')),
  ]
    .sort(sortByCreatedAtDesc)
    .slice(0, limit);

  return {
    stats: {
      totalOperators: totalOperatorsResult.count ?? 0,
      approvedOperators: approvedOperatorsResult.count ?? 0,
      pendingOperators: pendingApprovalsResult.data?.length ?? 0,
      totalSites: sitesCountResult.count ?? 0,
      todayReadings: (todayChlorinationReadingsResult.count ?? 0) + (todayDeepwellReadingsResult.count ?? 0),
    },
    pendingApprovals: pendingApprovalsResult.data ?? [],
    recentReadings,
    profiles: profilesResult.data ?? [],
    monthlyProduction: buildMonthlyProduction(monthlyChlorinationReadingsResult.data ?? []),
    dailyProduction: buildDailyProduction(monthlyChlorinationReadingsResult.data ?? []),
    monthlyPowerConsumption: buildMonthlyPowerConsumption({
      chlorinationReadings: monthlyChlorinationReadingsResult.data ?? [],
      deepwellReadings: monthlyDeepwellReadingsResult.data ?? [],
    }),
  };
}

export async function approveOperatorProfile({ profileId }) {
  requireSupabase();

  const { data, error } = await supabase.rpc('approve_operator_account', {
    target_profile_id: profileId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to approve operator.');
  }

  return data;
}

export async function assignProfileRole({ profileId, nextRole }) {
  requireSupabase();

  const { data, error } = await supabase.rpc('assign_profile_role', {
    target_profile_id: profileId,
    next_role: nextRole,
  });

  if (error) {
    throw new Error(error.message || 'Failed to update account role.');
  }

  return data;
}
