import { supabase } from '../lib/supabase';
import {
  buildDailyProduction,
  buildMonthlyChemicalUsage,
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

function startOfPreviousNightIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23);
  return start.toISOString();
}

function startOfTomorrowIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
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

  const todayIso = startOfTodayIso();
  const slotQueryStartIso = startOfPreviousNightIso();
  const tomorrowIso = startOfTomorrowIso();
  const [
    pendingApprovalsResult,
    totalOperatorsResult,
    approvedOperatorsResult,
    sitesResult,
    todayChlorinationReadingsResult,
    todayDeepwellReadingsResult,
    recentChlorinationReadingsResult,
    recentDeepwellReadingsResult,
    todayChlorinationSlotsResult,
    todayDeepwellSlotsResult,
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
    supabase
      .from('sites')
      .select('id, name, type')
      .order('type', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('chlorination_readings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayIso),
    supabase
      .from('deepwell_readings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayIso),
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
      .from('chlorination_readings')
      .select(
        'id, site_id, status, created_at, reading_datetime, slot_datetime, site:sites(id, name, type), submitted_profile:profiles!chlorination_readings_submitted_by_fkey(full_name, email)'
      )
      .gte('slot_datetime', slotQueryStartIso)
      .lt('slot_datetime', tomorrowIso)
      .order('slot_datetime', { ascending: true }),
    supabase
      .from('deepwell_readings')
      .select(
        'id, site_id, status, created_at, reading_datetime, slot_datetime, site:sites(id, name, type), submitted_profile:profiles!deepwell_readings_submitted_by_fkey(full_name, email)'
      )
      .gte('slot_datetime', slotQueryStartIso)
      .lt('slot_datetime', tomorrowIso)
      .order('slot_datetime', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, is_approved, approved_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('chlorination_readings')
      .select('id, site_id, status, created_at, reading_datetime, slot_datetime, totalizer, chlorine_consumed, peroxide_consumption, chlorination_power_kwh')
      .gte('reading_datetime', startOfMonthlyProductionSourceIso())
      .order('reading_datetime', { ascending: true }),
    supabase
      .from('deepwell_readings')
      .select('id, site_id, status, created_at, reading_datetime, slot_datetime, power_kwh_shift')
      .gte('reading_datetime', startOfMonthlyProductionSourceIso())
      .order('reading_datetime', { ascending: true }),
  ]);

  throwIfError(pendingApprovalsResult, 'Failed to load pending approvals.');
  throwIfError(totalOperatorsResult, 'Failed to count operators.');
  throwIfError(approvedOperatorsResult, 'Failed to count approved operators.');
  throwIfError(sitesResult, 'Failed to load sites.');
  throwIfError(todayChlorinationReadingsResult, 'Failed to count today chlorination readings.');
  throwIfError(todayDeepwellReadingsResult, 'Failed to count today deepwell readings.');
  throwIfError(recentChlorinationReadingsResult, 'Failed to load recent chlorination readings.');
  throwIfError(recentDeepwellReadingsResult, 'Failed to load recent deepwell readings.');
  throwIfError(todayChlorinationSlotsResult, 'Failed to load today chlorination slots.');
  throwIfError(todayDeepwellSlotsResult, 'Failed to load today deepwell slots.');
  throwIfError(profilesResult, 'Failed to load account roles.');
  throwIfError(monthlyChlorinationReadingsResult, 'Failed to load monthly chlorination production.');
  throwIfError(monthlyDeepwellReadingsResult, 'Failed to load monthly deepwell power consumption.');

  const recentReadings = [
    ...(recentChlorinationReadingsResult.data ?? []).map((row) => normalizeOfficeReading(row, 'CHLORINATION')),
    ...(recentDeepwellReadingsResult.data ?? []).map((row) => normalizeOfficeReading(row, 'DEEPWELL')),
  ]
    .sort(sortByCreatedAtDesc)
    .slice(0, limit);

  const todaySlotReadings = [
    ...(todayChlorinationSlotsResult.data ?? []).map((row) => normalizeOfficeReading(row, 'CHLORINATION')),
    ...(todayDeepwellSlotsResult.data ?? []).map((row) => normalizeOfficeReading(row, 'DEEPWELL')),
  ];

  return {
    stats: {
      totalOperators: totalOperatorsResult.count ?? 0,
      approvedOperators: approvedOperatorsResult.count ?? 0,
      pendingOperators: pendingApprovalsResult.data?.length ?? 0,
      totalSites: sitesResult.data?.length ?? 0,
      todayReadings: (todayChlorinationReadingsResult.count ?? 0) + (todayDeepwellReadingsResult.count ?? 0),
    },
    pendingApprovals: pendingApprovalsResult.data ?? [],
    recentReadings,
    sites: sitesResult.data ?? [],
    todaySlotReadings,
    profiles: profilesResult.data ?? [],
    monthlyProduction: buildMonthlyProduction(monthlyChlorinationReadingsResult.data ?? []),
    dailyProduction: buildDailyProduction(monthlyChlorinationReadingsResult.data ?? []),
    monthlyChemicalUsage: buildMonthlyChemicalUsage(monthlyChlorinationReadingsResult.data ?? []),
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
