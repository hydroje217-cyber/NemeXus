import { supabase } from '../lib/supabase';

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

export async function getOfficeDashboardSnapshot({ limit = 12 } = {}) {
  requireSupabase();

  const [
    pendingApprovalsResult,
    totalOperatorsResult,
    approvedOperatorsResult,
    sitesCountResult,
    todayReadingsResult,
    recentReadingsResult,
    profilesResult,
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
      .from('readings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfTodayIso()),
    supabase
      .from('readings')
      .select(
        'id, status, created_at, reading_datetime, slot_datetime, totalizer, site:sites(name, type), submitted_profile:profiles!readings_submitted_by_fkey(full_name, email)'
      )
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, is_approved, approved_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  throwIfError(pendingApprovalsResult, 'Failed to load pending approvals.');
  throwIfError(totalOperatorsResult, 'Failed to count operators.');
  throwIfError(approvedOperatorsResult, 'Failed to count approved operators.');
  throwIfError(sitesCountResult, 'Failed to count sites.');
  throwIfError(todayReadingsResult, 'Failed to count today readings.');
  throwIfError(recentReadingsResult, 'Failed to load recent readings.');
  throwIfError(profilesResult, 'Failed to load account roles.');

  return {
    stats: {
      totalOperators: totalOperatorsResult.count ?? 0,
      approvedOperators: approvedOperatorsResult.count ?? 0,
      pendingOperators: pendingApprovalsResult.data?.length ?? 0,
      totalSites: sitesCountResult.count ?? 0,
      todayReadings: todayReadingsResult.count ?? 0,
    },
    pendingApprovals: pendingApprovalsResult.data ?? [],
    recentReadings: recentReadingsResult.data ?? [],
    profiles: profilesResult.data ?? [],
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
