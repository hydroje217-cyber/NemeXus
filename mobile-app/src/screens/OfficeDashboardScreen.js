import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import LottieView from 'lottie-react-native';
import Card from '../components/Card';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { approveOperatorProfile, assignProfileRole, getOfficeDashboardSnapshot } from '../services/office';
import { formatTimestamp } from '../utils/time';

let styles = StyleSheet.create({});

const DAY_MINUTES = 24 * 60;
const HALF_HOUR_MINUTES = 30;

function formatSlotClock(minutes) {
  const normalizedMinutes = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours24 = Math.floor(normalizedMinutes / 60);
  const mins = normalizedMinutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

function createHalfHourWindows() {
  return Array.from({ length: DAY_MINUTES / HALF_HOUR_MINUTES }, (_, index) => {
    const startMinutes = index * HALF_HOUR_MINUTES;

    return {
      key: `slot-${String(startMinutes).padStart(4, '0')}`,
      label: formatSlotClock(startMinutes),
      startMinutes,
      endMinutes: startMinutes + HALF_HOUR_MINUTES - 1,
    };
  });
}

const SLOT_WINDOWS = createHalfHourWindows();
const SHIFT_FILTERS = [
  { key: 'current', label: 'Current shift' },
  { key: 'all', label: 'All elapsed' },
  { key: 'a', label: 'A-Shift' },
  { key: 'b', label: 'B-Shift' },
  { key: 'c', label: 'C-Shift' },
];
const CHLORINATION_READING_FIELDS = [
  { key: 'totalizer', label: 'Totalizer' },
  { key: 'pressure_psi', label: 'Pressure', unit: 'psi' },
  { key: 'rc_ppm', label: 'RC', unit: 'ppm' },
  { key: 'turbidity_ntu', label: 'Turbidity', unit: 'NTU' },
  { key: 'ph', label: 'pH' },
  { key: 'tds_ppm', label: 'TDS', unit: 'ppm' },
  { key: 'tank_level_liters', label: 'Tank level', unit: 'liters' },
  { key: 'flowrate_m3hr', label: 'Flowrate', unit: 'm3/hr' },
  { key: 'chlorine_consumed', label: 'Chlorine used', unit: 'kg' },
  { key: 'peroxide_consumption', label: 'Peroxide used' },
  { key: 'chlorination_power_kwh', label: 'Power used', unit: 'kWh' },
];
const DEEPWELL_READING_FIELDS = [
  { key: 'upstream_pressure_psi', label: 'Upstream pressure', unit: 'psi' },
  { key: 'downstream_pressure_psi', label: 'Downstream pressure', unit: 'psi' },
  { key: 'flowrate_m3hr', label: 'Flowrate', unit: 'm3/hr' },
  { key: 'vfd_frequency_hz', label: 'VFD frequency', unit: 'Hz' },
  { key: 'voltage_l1_v', label: 'Voltage L1', unit: 'V' },
  { key: 'voltage_l2_v', label: 'Voltage L2', unit: 'V' },
  { key: 'voltage_l3_v', label: 'Voltage L3', unit: 'V' },
  { key: 'amperage_a', label: 'Amperage', unit: 'A' },
  { key: 'tds_ppm', label: 'TDS', unit: 'ppm' },
  { key: 'power_kwh_shift', label: 'Shift power', unit: 'kWh' },
];

function formatMaybeTimestamp(value) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatTimestamp(parsed);
}

function formatRecordedValue(value, unit) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return unit ? `${value} ${unit}` : String(value);
}

function getRecordedValueRows(reading) {
  if (!reading) {
    return [];
  }

  const readingType = String(reading.site_type || reading.site?.type || '').toLowerCase();
  const fields = readingType === 'deepwell' ? DEEPWELL_READING_FIELDS : CHLORINATION_READING_FIELDS;
  return fields
    .filter(({ key }) => reading[key] !== null && reading[key] !== undefined && reading[key] !== '')
    .map((field) => ({
      label: field.label,
      value: formatRecordedValue(reading[field.key], field.unit),
    }));
}

function createSlotTime(minutes, baseDate = new Date(), dayOffset = 0) {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + dayOffset);
  date.setMinutes(minutes);
  return date;
}

function getMinutesSinceMidnight(value) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function findReadingForWindow(readings, site, window) {
  return readings.find((reading) => {
    const siteId = reading.site_id ?? reading.site?.id;
    if (String(siteId) !== String(site.id) || !reading.slot_datetime) {
      return false;
    }

    const slotDate = new Date(reading.slot_datetime);
    return slotDate >= window.windowStart && slotDate <= window.windowEnd;
  });
}

function getCheckpointStatus(window, reading, now) {
  if (reading) {
    const submittedAt = new Date(reading.created_at || reading.reading_datetime || reading.slot_datetime);
    return submittedAt > window.windowEnd ? 'late' : 'complete';
  }

  if (now > window.windowEnd) {
    return 'missing';
  }

  if (now >= window.windowStart && now <= window.windowEnd) {
    return 'due';
  }

  return 'upcoming';
}

function getWindowDayOffset(window, now = new Date()) {
  const currentMinutes = getMinutesSinceMidnight(now);
  const isCShiftSlot = getShiftKeyForMinutes(window.startMinutes) === 'c';
  const isLateNightCShift = currentMinutes >= 23 * 60;
  const isBeforeTonightCShift = currentMinutes < 23 * 60;
  const isEarlyMorningSlot = isCShiftSlot && window.startMinutes < 7 * 60;
  const isPreviousNightSlot = isCShiftSlot && window.startMinutes >= 23 * 60;

  if (isLateNightCShift && isEarlyMorningSlot) {
    return 1;
  }

  return isBeforeTonightCShift && isPreviousNightSlot ? -1 : 0;
}

function buildSlotTimeline({ sites = [], readings = [], typeFilter = 'all', now = new Date() }) {
  const filteredSites = sites.filter((site) => {
    return typeFilter === 'all' || String(site.type || '').toLowerCase() === typeFilter;
  });

  return SLOT_WINDOWS.map((window) => {
    const dayOffset = getWindowDayOffset(window, now);
    const windowWithDates = {
      ...window,
      dayOffset,
      windowStart: createSlotTime(window.startMinutes, now, dayOffset),
      windowEnd: createSlotTime(window.endMinutes, now, dayOffset),
    };
    const checkpoints = filteredSites.map((site) => {
      const reading = findReadingForWindow(readings, site, windowWithDates);
      return {
        id: `${windowWithDates.key}:${site.id}`,
        site,
        reading,
        status: getCheckpointStatus(windowWithDates, reading, now),
      };
    });

    return {
      ...windowWithDates,
      timeLabel: `${formatSlotClock(windowWithDates.startMinutes)}-${formatSlotClock(windowWithDates.endMinutes)}`,
      sortTime: windowWithDates.windowStart.getTime(),
      checkpoints,
    };
  });
}

function summarizeTimeline(timeline) {
  const checkpoints = timeline.flatMap((slot) => slot.checkpoints);

  return checkpoints.reduce(
    (summary, checkpoint) => ({
      ...summary,
      total: summary.total + 1,
      [checkpoint.status]: (summary[checkpoint.status] ?? 0) + 1,
    }),
    {
      total: 0,
      complete: 0,
      due: 0,
      late: 0,
      missing: 0,
      upcoming: 0,
    }
  );
}

function summarizeTimelineSlots(timeline) {
  return timeline.reduce(
    (summary, slot) => {
      const status = getSlotAggregateStatus(slot);

      return {
        ...summary,
        total: summary.total + 1,
        [status]: (summary[status] ?? 0) + 1,
      };
    },
    {
      total: 0,
      complete: 0,
      due: 0,
      late: 0,
      missing: 0,
      upcoming: 0,
    }
  );
}

function getSlotAggregateStatus(slot) {
  const statuses = slot.checkpoints.map((checkpoint) => checkpoint.status);

  if (!statuses.length) {
    return 'upcoming';
  }

  if (statuses.includes('missing')) {
    return 'missing';
  }

  if (statuses.includes('due')) {
    return 'due';
  }

  if (statuses.includes('late')) {
    return 'late';
  }

  if (statuses.every((status) => status === 'complete')) {
    return 'complete';
  }

  return 'upcoming';
}

function getShiftKeyForMinutes(minutes) {
  if (minutes >= 7 * 60 && minutes < 15 * 60) {
    return 'a';
  }

  if (minutes >= 15 * 60 && minutes < 23 * 60) {
    return 'b';
  }

  return 'c';
}

function getCurrentShiftKey(now = new Date()) {
  return getShiftKeyForMinutes(getMinutesSinceMidnight(now));
}

function filterTimelineByShift(timeline, shiftFilter, now = new Date()) {
  if (shiftFilter === 'all') {
    return timeline;
  }

  const targetShift = shiftFilter === 'current' ? getCurrentShiftKey(now) : shiftFilter;
  return timeline.filter((slot) => getShiftKeyForMinutes(slot.startMinutes) === targetShift);
}

function sortVisibleTimeline(timeline, now = new Date(), shiftFilter = 'current') {
  const shiftSlots = filterTimelineByShift(timeline, shiftFilter, now);
  return shiftSlots
    .filter((slot) => slot.windowStart <= now)
    .sort((a, b) => b.sortTime - a.sortTime);
}

function SectionHeader({ title, body, iconName = 'grid-outline', iconColor }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={iconName} size={14} color={iconColor} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {body ? <Text style={styles.sectionBody}>{body}</Text> : null}
    </View>
  );
}

function StatTile({ label, value, iconName, accent = 'teal', iconColor }) {
  const accentStyle = {
    teal: styles.statIconTeal,
    navy: styles.statIconNavy,
    amber: styles.statIconAmber,
    rose: styles.statIconRose,
  }[accent] || styles.statIconTeal;

  return (
    <View style={styles.statTile}>
      <View style={styles.statTopRow}>
        <Text style={styles.statLabel}>{label}</Text>
        <View style={[styles.statIconWrap, accentStyle]}>
          <Ionicons name={iconName} size={13} color={iconColor} />
        </View>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function RoleBadge({ role }) {
  const appearance = {
    operator: styles.roleOperator,
    supervisor: styles.roleSupervisor,
    manager: styles.roleManager,
    admin: styles.roleAdmin,
  }[role] || styles.roleOperator;

  return (
    <View style={[styles.roleBadge, appearance]}>
      <Text style={styles.roleBadgeText}>{String(role || 'operator').toUpperCase()}</Text>
    </View>
  );
}

function NavChip({ label, active, onPress, iconName, activeIconColor, iconColor }) {
  return (
    <Pressable onPress={onPress} style={[styles.navChip, active && styles.navChipActive]}>
      <Ionicons
        name={iconName}
        size={13}
        color={active ? activeIconColor : iconColor}
      />
      <Text style={[styles.navChipText, active && styles.navChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function QuickAction({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}>
      {icon}
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function SummaryCard({ title, value, body, actionLabel, onPress, iconName, iconColor, actionIconColor }) {
  return (
    <Card style={styles.summaryCard}>
      <View style={styles.summaryHeaderRow}>
        <View style={styles.summaryHeading}>
          <View style={styles.summaryIconWrap}>
            <Ionicons name={iconName} size={14} color={iconColor} />
          </View>
          <Text style={styles.summaryTitle}>{title}</Text>
        </View>
        <Pressable onPress={onPress} style={({ pressed }) => [styles.summaryActionPill, pressed && styles.quickActionPressed]}>
          <Text style={styles.summaryActionPillText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={11} color={actionIconColor} />
        </Pressable>
      </View>
      <View style={styles.summaryMetricRow}>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
      <Text style={styles.summaryBody} numberOfLines={2}>
        {body}
      </Text>
    </Card>
  );
}

function EntityCard({ children, style, accentStyle }) {
  return (
    <View style={[styles.entityCard, style]}>
      <View style={[styles.entityAccent, accentStyle]} />
      {children}
    </View>
  );
}

export default function OfficeDashboardScreen({ navigation }) {
  const { profile, signOut } = useAuth();
  const { palette, isDark } = useTheme();
  styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const isAdmin = profile?.role === 'admin';
  const roleChoices = ['operator', 'supervisor', 'manager', 'admin'];
  const [activeSection, setActiveSection] = useState('overview');
  const [dashboard, setDashboard] = useState({
    stats: {
      totalOperators: 0,
      approvedOperators: 0,
      pendingOperators: 0,
      totalSites: 0,
      todayReadings: 0,
    },
    pendingApprovals: [],
    recentReadings: [],
    sites: [],
    todaySlotReadings: [],
    profiles: [],
    monthlyProduction: {
      totalProduction: 0,
      averageProduction: 0,
      rows: [],
    },
    dailyProduction: {
      monthLabel: '',
      totalProduction: 0,
      rows: [],
    },
    monthlyPowerConsumption: {
      totalPower: 0,
      rows: [],
    },
  });
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState('');
  const [roleUpdatingId, setRoleUpdatingId] = useState('');
  const [openRoleMenuId, setOpenRoleMenuId] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [recentReadingFilter, setRecentReadingFilter] = useState('all');
  const [recentReadingDateFilter, setRecentReadingDateFilter] = useState('all');
  const [visibleRecentReadings, setVisibleRecentReadings] = useState(3);
  const [pendingNoticeDismissed, setPendingNoticeDismissed] = useState(false);
  const [showApprovalAnimation, setShowApprovalAnimation] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('info');
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [shiftFilter, setShiftFilter] = useState('current');
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);

  const sections = useMemo(() => {
    if (!isAdmin) {
      return [{ key: 'readings', label: 'Readings', iconName: 'reader-outline' }];
    }

    const baseSections = [
      { key: 'overview', label: 'Overview', iconName: 'grid-outline' },
      { key: 'approvals', label: 'Approvals', iconName: 'notifications-outline' },
      { key: 'readings', label: 'Readings', iconName: 'reader-outline' },
    ];

    if (isAdmin) {
      baseSections.push({ key: 'roles', label: 'Roles', iconName: 'people-outline' });
    }

    return baseSections;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin && activeSection !== 'readings') {
      setActiveSection('readings');
    }
  }, [activeSection, isAdmin]);

  async function loadDashboard({ silent = false, successMessage = '' } = {}) {
    if (!silent) {
      setLoading(true);
    }

    try {
      const nextDashboard = await getOfficeDashboardSnapshot();
      setDashboard(nextDashboard);

      if (successMessage) {
        setTone('success');
        setMessage(successMessage);
      } else if (!nextDashboard.pendingApprovals.length) {
        setTone('success');
        setMessage('All operator registrations are approved right now.');
      } else {
        setTone('info');
        setMessage('Office dashboard is synced with the live database.');
      }
    } catch (error) {
      setTone('error');
      setMessage(error.message || 'Failed to load office dashboard.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function handleApprove(operatorProfile) {
    setApprovingId(operatorProfile.id);
    setTone('info');
    setMessage(`Approving ${operatorProfile.full_name || operatorProfile.email || 'operator'}...`);

    try {
      await approveOperatorProfile({ profileId: operatorProfile.id });
      await loadDashboard({
        silent: true,
        successMessage: `${operatorProfile.full_name || operatorProfile.email || 'Operator'} is now approved for app access.`,
      });
      setShowApprovalAnimation(true);
    } catch (error) {
      setTone('error');
      setMessage(error.message || 'Approval failed.');
    } finally {
      setApprovingId('');
    }
  }

  async function handleRoleChange(targetProfile, nextRole) {
    setRoleUpdatingId(`${targetProfile.id}:${nextRole}`);
    setOpenRoleMenuId('');
    setTone('info');
    setMessage(`Updating ${targetProfile.full_name || targetProfile.email || 'account'} to ${nextRole}...`);

    try {
      await assignProfileRole({
        profileId: targetProfile.id,
        nextRole,
      });

      await loadDashboard({
        silent: true,
        successMessage: `${targetProfile.full_name || targetProfile.email || 'Account'} is now ${nextRole}.`,
      });
    } catch (error) {
      setTone('error');
      setMessage(error.message || 'Role update failed.');
    } finally {
      setRoleUpdatingId('');
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!supabase || !profile?.role || !['admin', 'manager', 'supervisor'].includes(profile.role)) {
      return undefined;
    }

    const refreshSlotTimeline = () => {
      loadDashboard({ silent: true });
    };

    const channel = supabase
      .channel('office-slot-checkpoints')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chlorination_readings' }, refreshSlotTimeline)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deepwell_readings' }, refreshSlotTimeline)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.role]);

  useEffect(() => {
    if (!dashboard.pendingApprovals.length) {
      setPendingNoticeDismissed(false);
    }
  }, [dashboard.pendingApprovals.length]);

  const roleFilterOptions = useMemo(
    () => [
      { key: 'all', label: 'All', iconName: 'apps-outline' },
      { key: 'operator', label: 'Operators', iconName: 'construct-outline' },
      { key: 'supervisor', label: 'Supervisors', iconName: 'shield-checkmark-outline' },
      { key: 'manager', label: 'Managers', iconName: 'briefcase-outline' },
      { key: 'admin', label: 'Admins', iconName: 'key-outline' },
    ],
    []
  );

  const filteredProfiles = useMemo(() => {
    if (roleFilter === 'all') {
      return dashboard.profiles;
    }

    return dashboard.profiles.filter((item) => item.role === roleFilter);
  }, [dashboard.profiles, roleFilter]);

  const recentReadingFilterOptions = useMemo(
    () => [
      { key: 'all', label: 'All', iconName: 'apps-outline' },
      { key: 'chlorination', label: 'Chlorination', iconName: 'water-outline' },
      { key: 'deepwell', label: 'Deepwell', iconName: 'flash-outline' },
    ],
    []
  );

  const recentReadingDateFilterOptions = useMemo(
    () => [
      { key: 'all', label: 'All time', iconName: 'time-outline' },
      { key: 'today', label: 'Today', iconName: 'today-outline' },
      { key: '24h', label: 'Last 24h', iconName: 'hourglass-outline' },
      { key: '7d', label: 'Last 7 days', iconName: 'calendar-outline' },
    ],
    []
  );

  function getRecentReadingTimestamp(item) {
    const rawValue = item?.slot_datetime || item?.created_at || item?.reading_datetime;
    const parsed = new Date(rawValue || '');
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  const filteredRecentReadings = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const last24Hours = now.getTime() - (24 * 60 * 60 * 1000);
    const last7Days = now.getTime() - (7 * 24 * 60 * 60 * 1000);

    return dashboard.recentReadings
      .filter((item) => {
        if (recentReadingFilter !== 'all' && String(item.site?.type || '').toLowerCase() !== recentReadingFilter) {
          return false;
        }

        const timestamp = getRecentReadingTimestamp(item);

        if (recentReadingDateFilter === 'today') {
          return timestamp >= startOfToday;
        }

        if (recentReadingDateFilter === '24h') {
          return timestamp >= last24Hours;
        }

        if (recentReadingDateFilter === '7d') {
          return timestamp >= last7Days;
        }

        return true;
      })
      .sort((a, b) => getRecentReadingTimestamp(b) - getRecentReadingTimestamp(a));
  }, [dashboard.recentReadings, recentReadingDateFilter, recentReadingFilter]);

  const visibleRecentReadingsList = useMemo(
    () => filteredRecentReadings.slice(0, visibleRecentReadings),
    [filteredRecentReadings, visibleRecentReadings]
  );

  useEffect(() => {
    setVisibleRecentReadings(3);
  }, [recentReadingDateFilter, recentReadingFilter, dashboard.recentReadings]);

  useEffect(() => {
    const intervalId = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(intervalId);
  }, []);

  const slotTimeline = useMemo(
    () =>
      sortVisibleTimeline(
        buildSlotTimeline({
          sites: dashboard.sites,
          readings: dashboard.todaySlotReadings,
          typeFilter: recentReadingFilter,
          now: currentTime,
        }),
        currentTime,
        shiftFilter
      ),
    [currentTime, dashboard.sites, dashboard.todaySlotReadings, recentReadingFilter, shiftFilter]
  );

  const expectedSlotTimeline = useMemo(
    () =>
      filterTimelineByShift(
        buildSlotTimeline({
          sites: dashboard.sites,
          readings: dashboard.todaySlotReadings,
          typeFilter: recentReadingFilter,
          now: currentTime,
        }),
        shiftFilter,
        currentTime
      ),
    [currentTime, dashboard.sites, dashboard.todaySlotReadings, recentReadingFilter, shiftFilter]
  );

  const slotSummary = useMemo(() => summarizeTimelineSlots(slotTimeline), [slotTimeline]);
  const expectedSlotSummary = useMemo(() => summarizeTimelineSlots(expectedSlotTimeline), [expectedSlotTimeline]);
  const upcomingSlotCount = Math.max(expectedSlotSummary.upcoming - slotSummary.upcoming, 0);

  const canViewGraphs = profile?.role === 'manager' || profile?.role === 'supervisor';
  const quickActions = [
    {
      key: 'refresh',
      icon: <Ionicons name="refresh" size={15} color={palette.teal600} />,
      label: 'Refresh',
      onPress: () => loadDashboard(),
      accent: 'teal',
    },
    canViewGraphs
      ? {
          key: 'graphs',
          icon: <Ionicons name="bar-chart-outline" size={15} color={palette.teal600} />,
          label: 'Dashboard Graphs',
          onPress: () => navigation.navigate('office-graphs'),
          accent: 'teal',
        }
      : null,
    {
      key: 'history',
      icon: <Ionicons name="reader-outline" size={15} color={isDark ? palette.ink900 : palette.navy700} />,
      label: 'Reading History',
      onPress: () => navigation.navigate('reading-history', { source: 'office-dashboard' }),
      accent: 'navy',
    },
  ].filter(Boolean);

  function renderOverview() {
    if (!isAdmin) {
      return renderSlotTimeline();
    }

    return (
      <View style={styles.sectionStack}>
        {dashboard.pendingApprovals.length && !pendingNoticeDismissed ? (
          <View style={styles.noticeCard}>
            <View style={styles.noticeTopRow}>
              <View style={styles.noticeCopy}>
                <View style={styles.noticeTitleRow}>
                  <Ionicons name="notifications" size={16} color={palette.amber500} />
                  <Text style={styles.noticeTitle}>Pending approvals</Text>
                  <View style={styles.noticeCountPill}>
                    <Text style={styles.noticeCountText}>{dashboard.pendingApprovals.length}</Text>
                  </View>
                </View>
                <Text style={styles.noticeBody}>
                  {dashboard.pendingApprovals.length} operator account(s) need your review.
                </Text>
              </View>
              <Pressable onPress={() => setPendingNoticeDismissed(true)} style={({ pressed }) => [styles.noticeDismiss, pressed && styles.quickActionPressed]}>
                <Ionicons name="close" size={14} color={palette.ink700} />
              </Pressable>
            </View>
            <View style={styles.noticeActions}>
              <Pressable onPress={() => setActiveSection('approvals')} style={({ pressed }) => [styles.noticeAction, pressed && styles.quickActionPressed]}>
                <Text style={styles.noticeActionText}>Open approvals</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Card style={styles.panelCard}>
          <SectionHeader
            title="Live summary"
            body="Registrations, approvals, sites, and reading activity."
            iconName="pulse-outline"
            iconColor={palette.teal600}
          />
          <View style={styles.statsGrid}>
            <StatTile label="Operators" value={dashboard.stats.totalOperators} iconName="people-outline" accent="navy" iconColor={palette.ink900} />
            <StatTile label="Approved" value={dashboard.stats.approvedOperators} iconName="checkmark-done-outline" accent="teal" iconColor={palette.ink900} />
            <StatTile label="Pending" value={dashboard.stats.pendingOperators} iconName="time-outline" accent="amber" iconColor={palette.ink900} />
            <StatTile label="Sites" value={dashboard.stats.totalSites} iconName="business-outline" accent="navy" iconColor={palette.ink900} />
            <StatTile label="Readings today" value={dashboard.stats.todayReadings} iconName="analytics-outline" accent="rose" iconColor={palette.ink900} />
          </View>
        </Card>

        <View style={[styles.summaryGrid, isWide && styles.summaryGridWide]}>
          <SummaryCard
            title="Pending approvals"
            value={dashboard.pendingApprovals.length}
            body="Review newly registered operators and approve them."
            actionLabel="Open"
            onPress={() => setActiveSection('approvals')}
            iconName="notifications-outline"
            iconColor={palette.ink900}
            actionIconColor={isDark ? palette.ink900 : palette.navy700}
          />
          <SummaryCard
            title="Slot checkpoints"
            value={`${slotSummary.complete}/${slotSummary.total}`}
            body="Confirm today's 30-minute site readings by time slot."
            actionLabel="Open"
            onPress={() => setActiveSection('readings')}
            iconName="checkmark-done-outline"
            iconColor={palette.ink900}
            actionIconColor={isDark ? palette.ink900 : palette.navy700}
          />
          {isAdmin ? (
            <SummaryCard
              title="Role management"
              value={dashboard.profiles.length}
              body="Promote trusted office accounts to supervisor, manager, or admin."
              actionLabel="Open"
              onPress={() => setActiveSection('roles')}
              iconName="people-circle-outline"
              iconColor={palette.ink900}
              actionIconColor={isDark ? palette.ink900 : palette.navy700}
            />
          ) : null}
        </View>

      </View>
    );
  }

  function renderApprovals() {
    if (!isAdmin) {
      return renderSlotTimeline();
    }

    return (
      <Card style={styles.panelCard}>
        <SectionHeader
          title="Pending registrations"
          body="Only admins can approve operators here. Approved accounts can enter the data collection flow immediately."
          iconName="person-add-outline"
          iconColor={palette.teal600}
        />

        {dashboard.pendingApprovals.length ? (
          <View style={styles.list}>
            {dashboard.pendingApprovals.map((item) => (
              <EntityCard key={item.id}>
                <View style={styles.entityHeader}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{item.full_name || item.email || 'Unnamed operator'}</Text>
                    <Text style={styles.rowMeta}>{item.email || '-'}</Text>
                  </View>
                  <RoleBadge role={item.role} />
                </View>

                <View style={styles.metaStrip}>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillLabel}>Registered</Text>
                    <Text style={styles.metaPillValue}>{formatMaybeTimestamp(item.created_at)}</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillLabel}>Approval</Text>
                    <Text style={styles.metaPillValue}>{item.is_approved ? 'Approved' : 'Waiting'}</Text>
                  </View>
                </View>

                <PrimaryButton
                  label={approvingId === item.id ? 'Approving...' : 'Approve operator'}
                  onPress={() => handleApprove(item)}
                  loading={approvingId === item.id}
                  icon={<Ionicons name="checkmark-circle-outline" size={16} color={palette.onAccent} />}
                />
              </EntityCard>
            ))}
          </View>
        ) : (
          <MessageBanner tone="success">No pending registrations are waiting for office approval.</MessageBanner>
        )}
      </Card>
    );
  }

  function renderSlotTimeline() {
    const statusMeta = {
      complete: { label: 'Done', iconName: 'checkmark-circle', style: styles.timelineStatusComplete },
      due: { label: 'Due now', iconName: 'radio-button-on', style: styles.timelineStatusDue },
      late: { label: 'Late', iconName: 'time', style: styles.timelineStatusLate },
      missing: { label: 'Missing', iconName: 'alert-circle', style: styles.timelineStatusMissing },
      upcoming: { label: 'Upcoming', iconName: 'ellipse-outline', style: styles.timelineStatusUpcoming },
    };

    return (
      <View style={styles.sectionStack}>
        <Card style={styles.panelCard}>
          <SectionHeader
            title="30-minute checkpoints"
            body="Current slot appears first. Future slots are counted in Upcoming, not shown below."
            iconName="checkmark-done-outline"
            iconColor={palette.teal600}
          />

          <View style={styles.recentReadingControlGroup}>
            <Text style={styles.recentReadingGroupLabel}>Site type</Text>
            <View style={styles.recentReadingFilterRow}>
              {recentReadingFilterOptions.map((option) => {
                const active = option.key === recentReadingFilter;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setRecentReadingFilter(option.key)}
                    style={[styles.recentReadingFilterChip, active && styles.recentReadingFilterChipActive]}
                  >
                    <Ionicons
                      name={option.iconName}
                      size={12}
                      color={active ? palette.onAccent : palette.ink700}
                    />
                    <Text style={[styles.recentReadingFilterChipText, active && styles.recentReadingFilterChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.recentReadingDateGroup}>
            <Text style={styles.recentReadingGroupLabel}>Shift</Text>
            <View style={styles.recentReadingDateFilterRow}>
              {SHIFT_FILTERS.map((option) => {
                const active = option.key === shiftFilter;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setShiftFilter(option.key)}
                    style={[styles.recentReadingDateChip, active && styles.recentReadingDateChipActive]}
                  >
                    <Text style={[styles.recentReadingDateChipText, active && styles.recentReadingDateChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.timelineSummaryGrid}>
            <View style={styles.timelineSummaryTile}>
              <Text style={styles.timelineSummaryValue}>{slotSummary.complete}</Text>
              <Text style={styles.timelineSummaryLabel}>Complete</Text>
            </View>
            <View style={styles.timelineSummaryTile}>
              <Text style={styles.timelineSummaryValue}>{slotSummary.missing}</Text>
              <Text style={styles.timelineSummaryLabel}>Missing</Text>
            </View>
            <View style={styles.timelineSummaryTile}>
              <Text style={styles.timelineSummaryValue}>{upcomingSlotCount}</Text>
              <Text style={styles.timelineSummaryLabel}>Upcoming</Text>
            </View>
          </View>

          {slotSummary.total ? (
            <View style={styles.timelineStack}>
              {slotTimeline.map((slot, index) => {
                const aggregateStatus = getSlotAggregateStatus(slot);
                const aggregateMeta = statusMeta[aggregateStatus] || statusMeta.upcoming;

                return (
                  <View key={slot.key} style={styles.timelineSlot}>
                    <View style={styles.timelineMarkerColumn}>
                      <View style={[styles.timelineNode, aggregateMeta.style]}>
                        <Ionicons name={aggregateMeta.iconName} size={14} color={palette.onAccent} />
                      </View>
                      {index < slotTimeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                    </View>

                    <View style={styles.timelineSlotBody}>
                      <View style={styles.timelineSlotHeader}>
                        <View>
                          <Text style={styles.timelineSlotTitle}>{slot.label}</Text>
                          <Text style={styles.timelineSlotTime}>{slot.timeLabel}</Text>
                        </View>
                        <View style={[styles.timelineStatusPill, aggregateMeta.style]}>
                          <Text style={styles.timelineStatusPillText}>{aggregateMeta.label}</Text>
                        </View>
                      </View>

                      <View style={styles.timelineCheckpointGrid}>
                        {slot.checkpoints.map((checkpoint) => {
                          const checkpointMeta = statusMeta[checkpoint.status] || statusMeta.upcoming;
                          const canOpenReading = Boolean(checkpoint.reading);
                          const submitter =
                            checkpoint.reading?.submitted_profile?.full_name ||
                            checkpoint.reading?.submitted_profile?.email ||
                            '';

                          return (
                            <Pressable
                              key={checkpoint.id}
                              disabled={!canOpenReading}
                              onPress={() => setSelectedCheckpoint({ ...checkpoint, slot })}
                              style={({ pressed }) => [
                                styles.timelineCheckpoint,
                                canOpenReading && styles.timelineCheckpointPressable,
                                pressed && canOpenReading ? styles.timelineCheckpointPressed : null,
                              ]}
                            >
                              <View style={[styles.timelineCheckpointIcon, checkpointMeta.style]}>
                                <Ionicons name={checkpointMeta.iconName} size={12} color={palette.onAccent} />
                              </View>
                              <View style={styles.timelineCheckpointCopy}>
                                <Text style={styles.timelineCheckpointSite} numberOfLines={1}>
                                  {checkpoint.site.name}
                                </Text>
                                <Text style={styles.timelineCheckpointMeta} numberOfLines={2}>
                                  {checkpoint.reading
                                    ? `${checkpointMeta.label} by ${submitter || '-'}`
                                    : checkpointMeta.label}
                                </Text>
                              </View>
                              {canOpenReading ? (
                                <Ionicons name="eye-outline" size={14} color={palette.ink500} />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <MessageBanner tone="info">No active sites match this checkpoint filter right now.</MessageBanner>
          )}
        </Card>
      </View>
    );
  }

  function renderRecordedValuesModal() {
    const reading = selectedCheckpoint?.reading;
    const valueRows = getRecordedValueRows(reading);
    const submitter =
      reading?.submitted_profile?.full_name ||
      reading?.submitted_profile?.email ||
      '-';

    return (
      <Modal
        visible={Boolean(reading)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedCheckpoint(null)}
      >
        <View style={styles.recordedValuesOverlay}>
          <Pressable style={styles.recordedValuesBackdrop} onPress={() => setSelectedCheckpoint(null)} />
          <View style={styles.recordedValuesSheet}>
            <View style={styles.recordedValuesHeader}>
              <View style={styles.recordedValuesTitleWrap}>
                <Text style={styles.recordedValuesEyebrow}>{reading?.site_type || reading?.site?.type || 'Reading'}</Text>
                <Text style={styles.recordedValuesTitle} numberOfLines={2}>
                  {selectedCheckpoint?.site?.name || reading?.site?.name || 'Recorded values'}
                </Text>
                <Text style={styles.recordedValuesMeta}>
                  {selectedCheckpoint?.slot?.timeLabel || formatMaybeTimestamp(reading?.slot_datetime)}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedCheckpoint(null)} style={styles.recordedValuesClose}>
                <Ionicons name="close" size={18} color={palette.ink700} />
              </Pressable>
            </View>

            <View style={styles.recordedValuesMetaGrid}>
              <View style={styles.recordedValuesMetaTile}>
                <Text style={styles.recordedValuesMetaLabel}>Submitted by</Text>
                <Text style={styles.recordedValuesMetaValue} numberOfLines={2}>{submitter}</Text>
              </View>
              <View style={styles.recordedValuesMetaTile}>
                <Text style={styles.recordedValuesMetaLabel}>Saved</Text>
                <Text style={styles.recordedValuesMetaValue}>{formatMaybeTimestamp(reading?.created_at)}</Text>
              </View>
            </View>

            <ScrollView style={styles.recordedValuesScroll} contentContainerStyle={styles.recordedValuesList}>
              {valueRows.length ? (
                valueRows.map((row) => (
                  <View key={row.label} style={styles.recordedValueRow}>
                    <Text style={styles.recordedValueLabel}>{row.label}</Text>
                    <Text style={styles.recordedValueValue}>{row.value}</Text>
                  </View>
                ))
              ) : (
                <MessageBanner tone="info">No numeric values were saved for this reading.</MessageBanner>
              )}

              {reading?.remarks ? (
                <View style={styles.recordedRemarks}>
                  <Text style={styles.recordedValueLabel}>Remarks</Text>
                  <Text style={styles.recordedRemarksText}>{reading.remarks}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  function renderReadings() {
    function getReadingCardAppearance(siteType) {
      const normalizedType = String(siteType || '').toLowerCase();

      if (normalizedType === 'chlorination') {
        return {
          cardStyle: styles.readingCardChlorination,
          accentStyle: styles.entityAccentChlorination,
        };
      }

      if (normalizedType === 'deepwell') {
        return {
          cardStyle: styles.readingCardDeepwell,
          accentStyle: styles.entityAccentDeepwell,
        };
      }

      return {
        cardStyle: null,
        accentStyle: null,
      };
    }

    return (
      <View style={styles.sectionStack}>
        <Card style={styles.panelCard}>
          <SectionHeader
            title="Recent readings"
            body={isAdmin ? 'Latest submissions from the shared database.' : 'This account has readings-only office access.'}
            iconName="reader-outline"
            iconColor={palette.teal600}
          />

          <View style={styles.recentReadingControlGroup}>
            <Text style={styles.recentReadingGroupLabel}>Sort by type</Text>
            <View style={styles.recentReadingFilterRow}>
              {recentReadingFilterOptions.map((option) => {
                const active = option.key === recentReadingFilter;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setRecentReadingFilter(option.key)}
                    style={[styles.recentReadingFilterChip, active && styles.recentReadingFilterChipActive]}
                  >
                    <Ionicons
                      name={option.iconName}
                      size={12}
                      color={active ? palette.onAccent : palette.ink700}
                    />
                    <Text style={[styles.recentReadingFilterChipText, active && styles.recentReadingFilterChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.recentReadingDateGroup}>
            <Text style={styles.recentReadingGroupLabel}>Date range</Text>
            <View style={styles.recentReadingDateFilterRow}>
              {recentReadingDateFilterOptions.map((option) => {
                const active = option.key === recentReadingDateFilter;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setRecentReadingDateFilter(option.key)}
                    style={[styles.recentReadingDateChip, active && styles.recentReadingDateChipActive]}
                  >
                    <Ionicons
                      name={option.iconName}
                      size={12}
                      color={active ? palette.onAccent : palette.ink700}
                    />
                    <Text style={[styles.recentReadingDateChipText, active && styles.recentReadingDateChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {filteredRecentReadings.length ? (
            <View style={styles.list}>
              {visibleRecentReadingsList.map((item) => {
                const appearance = getReadingCardAppearance(item.site?.type);

                return (
                  <EntityCard
                    key={item.id}
                    style={[appearance.cardStyle, styles.compactReadingCard]}
                    accentStyle={appearance.accentStyle}
                  >
                    <View style={styles.compactReadingHeader}>
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{item.site?.name || 'Unknown site'}</Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {(item.submitted_profile?.full_name || item.submitted_profile?.email || '-')} · {formatMaybeTimestamp(item.slot_datetime)}
                        </Text>
                      </View>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>{String(item.status || '-').toUpperCase()}</Text>
                      </View>
                    </View>

                    <View style={styles.compactReadingFooter}>
                      <Text style={styles.compactReadingType}>{item.site?.type || '-'}</Text>
                      <Text style={styles.compactReadingMetric}>
                        {item.site?.type === 'DEEPWELL'
                          ? `Flow ${item.flowrate_m3hr ?? '-'}`
                          : `Totalizer ${item.totalizer ?? '-'}`}
                      </Text>
                      <Text style={styles.compactReadingTime}>Saved {formatMaybeTimestamp(item.created_at)}</Text>
                    </View>
                  </EntityCard>
                );
              })}

              {filteredRecentReadings.length > visibleRecentReadings ? (
                <PrimaryButton
                  label={`Show more (${filteredRecentReadings.length - visibleRecentReadings} left)`}
                  onPress={() => setVisibleRecentReadings((current) => current + 3)}
                  tone="secondary"
                  icon={<Ionicons name="chevron-down-outline" size={16} color={palette.ink900} />}
                />
              ) : null}
            </View>
          ) : (
            <MessageBanner tone="info">
              {recentReadingFilter === 'all' && recentReadingDateFilter === 'all'
                ? 'No readings have been submitted yet.'
                : 'No recent readings match the selected filters right now.'}
            </MessageBanner>
          )}
        </Card>

      </View>
    );
  }

  function renderRoles() {
    if (!isAdmin) {
      return null;
    }

    return (
      <Card style={styles.panelCard}>
        <SectionHeader
          title="Account roles"
          body="The first admin is still a one-time SQL bootstrap. After that, only admins can promote accounts here."
          iconName="people-outline"
          iconColor={palette.teal600}
        />

        <View style={styles.rolesTopRow}>
          <Text style={styles.rolesMeta}>
            {filteredProfiles.length} {filteredProfiles.length === 1 ? 'account' : 'accounts'}
          </Text>
          <View style={styles.roleFilterRow}>
            {roleFilterOptions.map((option) => {
              const active = option.key === roleFilter;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setRoleFilter(option.key)}
                  style={[styles.roleFilterChip, active && styles.roleFilterChipActive]}
                >
                  <Ionicons
                    name={option.iconName}
                    size={12}
                    color={active ? palette.onAccent : palette.ink700}
                  />
                  <Text style={[styles.roleFilterChipText, active && styles.roleFilterChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {filteredProfiles.length ? (
          <View style={styles.list}>
            {filteredProfiles.map((item) => (
              <EntityCard key={item.id}>
                <View style={styles.entityHeader}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{item.full_name || item.email || 'Unnamed user'}</Text>
                    <Text style={styles.rowMeta}>{item.email || '-'}</Text>
                  </View>
                  <RoleBadge role={item.role} />
                </View>

                <View style={styles.metaStrip}>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillLabel}>Approved</Text>
                    <Text style={styles.metaPillValue}>{item.is_approved ? 'Yes' : 'No'}</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillLabel}>Created</Text>
                    <Text style={styles.metaPillValue}>{formatMaybeTimestamp(item.created_at)}</Text>
                  </View>
                </View>

                {item.id === profile?.id ? (
                  <MessageBanner tone="info">Current signed-in admin account.</MessageBanner>
                ) : (
                  <View style={styles.rolePickerWrap}>
                    <Text style={styles.rolePickerLabel}>Change role</Text>
                    <Pressable
                      onPress={() =>
                        setOpenRoleMenuId((current) => (current === item.id ? '' : item.id))
                      }
                      style={({ pressed }) => [
                        styles.roleSelect,
                        openRoleMenuId === item.id && styles.roleSelectOpen,
                        pressed && styles.roleSelectPressed,
                      ]}
                    >
                      <Text style={styles.roleSelectText}>
                        {roleUpdatingId.startsWith(`${item.id}:`) ? 'Updating...' : 'Select role'}
                      </Text>
                      <Ionicons
                        name={openRoleMenuId === item.id ? 'chevron-up' : 'chevron-down'}
                        size={15}
                        color={palette.ink700}
                      />
                    </Pressable>

                    {openRoleMenuId === item.id ? (
                      <View style={styles.roleMenu}>
                        {roleChoices
                          .filter((choice) => choice !== item.role)
                          .map((choice, index) => {
                            const isUpdating = roleUpdatingId === `${item.id}:${choice}`;

                            return (
                              <Pressable
                                key={choice}
                                onPress={() => handleRoleChange(item, choice)}
                                disabled={Boolean(roleUpdatingId)}
                                style={({ pressed }) => [
                                  styles.roleMenuItem,
                                  index === 0 ? styles.roleMenuItemFirst : null,
                                  pressed && !roleUpdatingId ? styles.roleMenuItemPressed : null,
                                ]}
                              >
                                <Text style={styles.roleMenuItemText}>
                                  {isUpdating
                                    ? 'Updating...'
                                    : `${choice.charAt(0).toUpperCase()}${choice.slice(1)}`}
                                </Text>
                              </Pressable>
                            );
                          })}
                      </View>
                    ) : null}
                  </View>
                )}
              </EntityCard>
            ))}
          </View>
        ) : (
          <MessageBanner tone="info">
            No accounts match the selected role filter right now.
          </MessageBanner>
        )}
      </Card>
    );
  }

  function renderSection() {
    if (activeSection === 'approvals') {
      return renderApprovals();
    }

    if (activeSection === 'readings') {
      return renderSlotTimeline();
    }

    if (activeSection === 'roles') {
      return renderRoles();
    }

    return renderOverview();
  }

  return (
    <ScreenShell
      eyebrow="NemeXus Monitoring"
      title="Office control center"
      subtitle={
        isAdmin
          ? 'Admins can approve registrations, review readings, and manage office roles from here.'
          : 'This office account can review readings only.'
      }
    >
      {renderRecordedValuesModal()}

      <Modal
        visible={showApprovalAnimation}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowApprovalAnimation(false)}
      >
        <View style={styles.approvalAnimationOverlay}>
          <View style={styles.approvalAnimationPanel}>
            <LottieView
              source={require('../../assets/PersonApproved.json')}
              autoPlay
              loop={false}
              style={styles.approvalAnimation}
              onAnimationFinish={() => {
                setTimeout(() => setShowApprovalAnimation(false), 700);
              }}
            />
          </View>
        </View>
      </Modal>

      <Card style={styles.profileCard}>
        <View style={styles.profileTopRow}>
          <View style={styles.profileCopy}>
            <Text style={styles.sectionEyebrow}>Office account</Text>
            <Text style={styles.userName}>{profile?.full_name || profile?.email || 'Office user'}</Text>
            <Text style={styles.userMeta}>{profile?.email || '-'}</Text>
          </View>
          <View style={styles.profileActions}>
            <RoleBadge role={profile?.role} />
            <Pressable onPress={signOut} style={({ pressed }) => [styles.signOutMini, pressed && styles.signOutMiniPressed]}>
              <Ionicons name="log-out-outline" size={14} color={palette.amber500} />
              <Text style={styles.signOutMiniLabel}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </Card>

      <Card style={styles.quickActionsCard}>
        <View style={styles.quickActionsTopRow}>
          <View style={styles.quickActionsHeader}>
            <Text style={styles.sectionEyebrow}>Quick Access Tools</Text>
          </View>
          <View style={styles.quickActionsRow}>
            {quickActions.map((action) => (
              <QuickAction
                key={action.key}
                icon={action.icon}
                label={action.label}
                onPress={action.onPress}
                accent={action.accent}
              />
            ))}
          </View>
        </View>
      </Card>

      {isAdmin ? (
        <Card style={styles.navigationCard}>
          <View style={styles.navigationHeader}>
            <Text style={styles.navigationTitle}>Sections</Text>
            <Text style={styles.navigationMeta}>{sections.length} views</Text>
          </View>
          <View style={styles.navRow}>
            {sections.map((section) => (
              <NavChip
                key={section.key}
                label={section.label}
                iconName={section.iconName}
                active={activeSection === section.key}
                onPress={() => setActiveSection(section.key)}
                iconColor={palette.ink700}
                activeIconColor={palette.onAccent}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {message ? <MessageBanner tone={tone}>{message}</MessageBanner> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.teal600} />
        </View>
      ) : (
        renderSection()
      )}
    </ScreenShell>
  );
}

function createStyles(palette, isDark) {
  return StyleSheet.create({
  approvalAnimationOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(3,10,17,0.82)' : 'rgba(17,35,59,0.42)',
    padding: 24,
  },
  approvalAnimationPanel: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: isDark ? '#27445E' : '#D8E6F5',
    backgroundColor: isDark ? '#07131F' : '#FFFFFF',
    shadowColor: isDark ? '#000000' : '#0F172A',
    shadowOpacity: isDark ? 0.24 : 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  approvalAnimation: {
    width: 190,
    height: 190,
  },
  recordedValuesOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  recordedValuesBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: isDark ? 'rgba(3,10,17,0.78)' : 'rgba(17,35,59,0.44)',
  },
  recordedValuesSheet: {
    maxHeight: '82%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: isDark ? '#27445E' : '#D8E6F5',
    backgroundColor: isDark ? '#07131F' : '#FFFFFF',
    padding: 14,
    shadowColor: isDark ? '#000000' : '#0F172A',
    shadowOpacity: isDark ? 0.28 : 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  recordedValuesHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  recordedValuesTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  recordedValuesEyebrow: {
    color: palette.teal600,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  recordedValuesTitle: {
    marginTop: 4,
    color: palette.ink900,
    fontSize: 18,
    fontWeight: '900',
  },
  recordedValuesMeta: {
    marginTop: 4,
    color: palette.ink500,
    fontSize: 11,
    fontWeight: '700',
  },
  recordedValuesClose: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? '#132536' : '#F4F8FC',
  },
  recordedValuesMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  recordedValuesMetaTile: {
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: 132,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? '#102131' : '#F7FBFF',
    padding: 9,
  },
  recordedValuesMetaLabel: {
    color: palette.ink500,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  recordedValuesMetaValue: {
    marginTop: 4,
    color: palette.ink900,
    fontSize: 11,
    fontWeight: '800',
  },
  recordedValuesScroll: {
    marginTop: 12,
  },
  recordedValuesList: {
    gap: 8,
    paddingBottom: 4,
  },
  recordedValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? palette.mist : '#FAFDFF',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  recordedValueLabel: {
    flex: 1,
    color: palette.ink700,
    fontSize: 11,
    fontWeight: '800',
  },
  recordedValueValue: {
    flexShrink: 1,
    color: palette.ink900,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  recordedRemarks: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? '#102131' : '#F7FBFF',
    padding: 10,
  },
  recordedRemarksText: {
    marginTop: 5,
    color: palette.ink900,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  profileCard: {
    paddingVertical: 10,
  },
  quickActionsCard: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  quickActionsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionsHeader: {
    gap: 1,
    flexGrow: 1,
    flexShrink: 0,
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    flexGrow: 1,
    flexShrink: 1,
  },
  quickAction: {
    minWidth: 118,
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? palette.mist : '#F7FBFF',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  quickActionPressed: {
    transform: [{ scale: 0.98 }],
  },
  quickActionLabel: {
    color: palette.ink900,
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  navigationCard: {
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  navigationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navigationTitle: {
    color: palette.ink900,
    fontSize: 13,
    fontWeight: '800',
  },
  navigationMeta: {
    color: palette.ink500,
    fontSize: 11,
    fontWeight: '700',
  },
  profileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  profileActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  profileCopy: {
    flex: 1,
  },
  signOutMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: isDark ? '#A77925' : '#F7D6A7',
    backgroundColor: isDark ? '#3A2910' : '#FFF5E8',
  },
  signOutMiniPressed: {
    transform: [{ scale: 0.98 }],
  },
  signOutMiniLabel: {
    color: isDark ? palette.amber500 : palette.navy900,
    fontSize: 11,
    fontWeight: '800',
  },
  sectionEyebrow: {
    color: isDark ? palette.heroSubtitle : palette.ink500,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  sectionHeader: {
    gap: 3,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#16304A' : '#EAF2FB',
    borderWidth: 1,
    borderColor: isDark ? '#31506E' : '#C9DDF3',
  },
  sectionTitle: {
    color: palette.ink900,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionBody: {
    color: palette.ink700,
    fontSize: 12,
    lineHeight: 16,
  },
  userName: {
    marginTop: 4,
    color: isDark ? palette.ink900 : palette.navy900,
    fontSize: 16,
    fontWeight: '900',
  },
  userMeta: {
    marginTop: 2,
    color: palette.ink700,
    fontSize: 12,
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  navChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: isDark ? palette.mist : '#F2F8FE',
    borderWidth: 1,
    borderColor: palette.line,
  },
  navChipActive: {
    backgroundColor: palette.navy700,
    borderColor: palette.cyan300,
  },
  navChipText: {
    color: palette.ink700,
    fontSize: 10,
    fontWeight: '800',
  },
  navChipTextActive: {
    color: palette.onAccent,
  },
  sectionStack: {
    gap: 10,
  },
  panelCard: {
    gap: 8,
    padding: 11,
  },
  statsGrid: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  statTile: {
    minWidth: 104,
    flexGrow: 1,
    backgroundColor: isDark ? palette.mist : '#F7FBFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 2,
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statIconTeal: {
    backgroundColor: isDark ? '#123A37' : '#E5F5F3',
    borderColor: isDark ? '#1FAF9E' : '#B4E5DE',
  },
  statIconNavy: {
    backgroundColor: isDark ? '#172A3F' : '#EAF2FB',
    borderColor: isDark ? '#41678A' : '#C9DDF3',
  },
  statIconAmber: {
    backgroundColor: isDark ? '#3A2910' : '#FFF5E8',
    borderColor: isDark ? '#A77925' : '#F7D6A7',
  },
  statIconRose: {
    backgroundColor: isDark ? '#35121C' : '#FFF0F3',
    borderColor: isDark ? '#A84257' : '#FECACA',
  },
  statLabel: {
    color: palette.ink500,
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    marginTop: 2,
    color: isDark ? palette.ink900 : palette.navy900,
    fontSize: 16,
    fontWeight: '900',
  },
  summaryGrid: {
    gap: 6,
  },
  summaryGridWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  summaryCard: {
    gap: 6,
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: isDark ? '#27445E' : '#D8E6F5',
    backgroundColor: isDark ? '#112131' : '#FBFDFF',
    minHeight: 0,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    paddingRight: 6,
  },
  summaryIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#16304A' : '#EAF2FB',
    borderWidth: 1,
    borderColor: isDark ? '#31506E' : '#C9DDF3',
  },
  summaryActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: isDark ? '#365A78' : '#BFD7F0',
    backgroundColor: isDark ? '#173047' : '#F2F8FE',
  },
  summaryActionPillText: {
    color: isDark ? palette.ink900 : palette.navy700,
    fontSize: 9,
    fontWeight: '800',
  },
  summaryMetricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryValue: {
    color: isDark ? palette.ink900 : palette.navy900,
    fontSize: 18,
    fontWeight: '900',
  },
  summaryTitle: {
    color: palette.ink900,
    fontSize: 12,
    fontWeight: '800',
  },
  summaryBody: {
    color: palette.ink700,
    fontSize: 10,
    lineHeight: 14,
  },
  list: {
    gap: 6,
  },
  noticeCard: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? '#A77925' : '#F7D6A7',
    backgroundColor: isDark ? '#3A2910' : '#FFF5E8',
    padding: 10,
    gap: 8,
  },
  noticeCopy: {
    gap: 4,
    flex: 1,
  },
  noticeTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  noticeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  noticeTitle: {
    color: isDark ? palette.warningText : '#8A5308',
    fontSize: 12,
    fontWeight: '800',
  },
  noticeCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: isDark ? '#5A4017' : '#F6DFB8',
  },
  noticeCountText: {
    color: isDark ? palette.warningText : '#8A5308',
    fontSize: 10,
    fontWeight: '900',
  },
  noticeBody: {
    color: isDark ? palette.heroSubtitle : palette.ink700,
    fontSize: 11,
    lineHeight: 15,
  },
  noticeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  noticeAction: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: isDark ? '#4A3514' : '#F6DFB8',
  },
  noticeActionText: {
    color: isDark ? palette.warningText : '#8A5308',
    fontSize: 10,
    fontWeight: '800',
  },
  noticeDismiss: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? '#152636' : '#FFF8ED',
  },
  entityCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? palette.mist : '#FAFDFF',
    padding: 10,
    overflow: 'hidden',
  },
  entityAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: isDark ? '#2B8D99' : '#8CCFDE',
  },
  readingCardChlorination: {
    backgroundColor: isDark ? '#112A2A' : '#F0FCFF',
    borderColor: isDark ? '#2D8F9C' : '#A8E9F4',
  },
  readingCardDeepwell: {
    backgroundColor: isDark ? '#2F2310' : '#FFF6E8',
    borderColor: isDark ? '#B57A1F' : '#F2C27A',
  },
  entityAccentChlorination: {
    backgroundColor: isDark ? '#39C6D8' : '#26AEC4',
  },
  entityAccentDeepwell: {
    backgroundColor: isDark ? '#F2B44A' : '#E39A22',
  },
  entityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  rowCopy: {
    gap: 2,
    flex: 1,
  },
  rowTitle: {
    color: palette.ink900,
    fontSize: 13,
    fontWeight: '800',
  },
  rowMeta: {
    color: palette.ink700,
    fontSize: 10,
    lineHeight: 13,
  },
  metaStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    minWidth: 96,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? '#152636' : '#F2F8FE',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  metaPillLabel: {
    color: palette.ink500,
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaPillValue: {
    marginTop: 2,
    color: isDark ? palette.ink900 : palette.navy900,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  readingDetails: {
    gap: 2,
  },
  compactReadingCard: {
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  compactReadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  compactReadingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  compactReadingType: {
    color: palette.ink500,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  compactReadingMetric: {
    color: palette.ink900,
    fontSize: 10,
    fontWeight: '800',
  },
  compactReadingTime: {
    color: palette.ink700,
    fontSize: 10,
    fontWeight: '600',
  },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  roleOperator: {
    backgroundColor: isDark ? '#172A3F' : '#EFF6FF',
    borderColor: isDark ? '#41678A' : '#BFDBFE',
  },
  roleSupervisor: {
    backgroundColor: isDark ? '#103228' : '#ECFDF5',
    borderColor: isDark ? '#2F8F72' : '#A7F3D0',
  },
  roleManager: {
    backgroundColor: isDark ? '#3A2910' : '#FFF7ED',
    borderColor: isDark ? '#A77925' : '#FED7AA',
  },
  roleAdmin: {
    backgroundColor: isDark ? '#35121C' : '#FEF2F2',
    borderColor: isDark ? '#A84257' : '#FECACA',
  },
  roleBadgeText: {
    color: isDark ? palette.ink900 : palette.navy900,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusBadge: {
    borderRadius: 999,
    backgroundColor: isDark ? '#10313A' : '#E6FBFF',
    borderWidth: 1,
    borderColor: isDark ? '#2B8D99' : '#B7F0F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: isDark ? palette.ink900 : palette.navy900,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  roleActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  roleActionItem: {
    minWidth: 120,
    flexGrow: 1,
  },
  rolePickerWrap: {
    gap: 5,
  },
  rolePickerLabel: {
    color: palette.ink500,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  roleSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? palette.mist : '#F8FBFE',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  roleSelectOpen: {
    borderColor: palette.lineStrong,
    backgroundColor: isDark ? '#152636' : '#F2F8FE',
  },
  roleSelectPressed: {
    transform: [{ scale: 0.99 }],
  },
  roleSelectText: {
    color: palette.ink900,
    fontSize: 11,
    fontWeight: '700',
  },
  roleMenu: {
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
  },
  roleMenuItem: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  roleMenuItemFirst: {
    borderTopWidth: 0,
  },
  roleMenuItemPressed: {
    backgroundColor: isDark ? '#152636' : '#F4F9FF',
  },
  roleMenuItemText: {
    color: palette.ink900,
    fontSize: 11,
    fontWeight: '700',
  },
  rolesTopRow: {
    gap: 6,
  },
  rolesMeta: {
    color: palette.ink500,
    fontSize: 10,
    fontWeight: '700',
  },
  roleFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recentReadingFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: -2,
    marginBottom: 2,
  },
  recentReadingControlGroup: {
    gap: 6,
  },
  recentReadingDateGroup: {
    gap: 6,
    marginBottom: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  recentReadingGroupLabel: {
    color: palette.ink500,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  recentReadingDateFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recentReadingFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: isDark ? '#132131' : '#F3F8FD',
    borderWidth: 1,
    borderColor: palette.line,
  },
  recentReadingFilterChipActive: {
    backgroundColor: palette.navy700,
    borderColor: palette.cyan300,
  },
  recentReadingFilterChipText: {
    color: palette.ink700,
    fontSize: 10,
    fontWeight: '700',
  },
  recentReadingFilterChipTextActive: {
    color: palette.onAccent,
  },
  recentReadingDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: isDark ? '#152636' : '#F2F8FE',
    borderWidth: 1,
    borderColor: palette.line,
  },
  recentReadingDateChipActive: {
    backgroundColor: palette.navy700,
    borderColor: palette.cyan300,
  },
  recentReadingDateChipText: {
    color: palette.ink700,
    fontSize: 9,
    fontWeight: '800',
  },
  recentReadingDateChipTextActive: {
    color: palette.onAccent,
  },
  timelineSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  timelineSummaryTile: {
    minWidth: 94,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? '#152636' : '#F7FBFF',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  timelineSummaryValue: {
    color: isDark ? palette.ink900 : palette.navy900,
    fontSize: 16,
    fontWeight: '900',
  },
  timelineSummaryLabel: {
    marginTop: 2,
    color: palette.ink500,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  timelineStack: {
    gap: 0,
  },
  timelineSlot: {
    flexDirection: 'row',
    gap: 10,
  },
  timelineMarkerColumn: {
    width: 28,
    alignItems: 'center',
  },
  timelineNode: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 30,
    backgroundColor: isDark ? '#284256' : '#D7E5EF',
  },
  timelineSlotBody: {
    flex: 1,
    gap: 8,
    paddingBottom: 12,
  },
  timelineSlotHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  timelineSlotTitle: {
    color: palette.ink900,
    fontSize: 13,
    fontWeight: '900',
  },
  timelineSlotTime: {
    marginTop: 2,
    color: palette.ink500,
    fontSize: 10,
    fontWeight: '700',
  },
  timelineStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timelineStatusPillText: {
    color: palette.onAccent,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  timelineCheckpointGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  timelineCheckpoint: {
    minWidth: 136,
    flexGrow: 1,
    flexBasis: '48%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? palette.mist : '#FAFDFF',
    padding: 8,
  },
  timelineCheckpointPressable: {
    borderColor: isDark ? '#2F8F72' : '#B9E4D6',
  },
  timelineCheckpointPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  timelineCheckpointIcon: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  timelineCheckpointCopy: {
    flex: 1,
    minWidth: 0,
  },
  timelineCheckpointSite: {
    color: palette.ink900,
    fontSize: 11,
    fontWeight: '800',
  },
  timelineCheckpointMeta: {
    marginTop: 2,
    color: palette.ink700,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
  timelineStatusComplete: {
    backgroundColor: isDark ? '#103228' : '#16A34A',
    borderColor: isDark ? '#2F8F72' : '#15803D',
  },
  timelineStatusDue: {
    backgroundColor: isDark ? '#123A37' : '#0EA5A4',
    borderColor: isDark ? '#1FAF9E' : '#0F766E',
  },
  timelineStatusLate: {
    backgroundColor: isDark ? '#3A2910' : '#F59E0B',
    borderColor: isDark ? '#A77925' : '#B45309',
  },
  timelineStatusMissing: {
    backgroundColor: isDark ? '#35121C' : '#DC2626',
    borderColor: isDark ? '#A84257' : '#991B1B',
  },
  timelineStatusUpcoming: {
    backgroundColor: isDark ? '#24364A' : '#64748B',
    borderColor: isDark ? '#41678A' : '#475569',
  },
  roleFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: isDark ? '#152636' : '#F2F8FE',
  },
  roleFilterChipActive: {
    backgroundColor: palette.navy700,
    borderColor: palette.cyan300,
  },
  roleFilterChipText: {
    color: palette.ink700,
    fontSize: 9,
    fontWeight: '800',
  },
  roleFilterChipTextActive: {
    color: palette.onAccent,
  },
  });
}
