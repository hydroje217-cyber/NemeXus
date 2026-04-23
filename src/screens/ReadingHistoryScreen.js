import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Share,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Card from '../components/Card';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell, { KeyboardScrollContext } from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { listReadings } from '../services/readings';

function formatDateValue(date) {
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function MobileDateField({ label, value, placeholder, onPress }) {
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);

  return (
    <View style={styles.filterField}>
      <Text style={styles.filterLabel}>{label}</Text>
      <Pressable onPress={onPress} style={styles.dateField}>
        <View style={styles.inputRow}>
          <View style={styles.inputIconWrap}>
            <Ionicons name="calendar-outline" size={15} color={palette.ink500} />
          </View>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.dateFieldValue, !value && styles.dateFieldPlaceholder]}
          >
            {value || placeholder}
          </Text>
          <Ionicons name="chevron-down" size={14} color={palette.ink500} />
        </View>
      </Pressable>
    </View>
  );
}

function ScrollAwareTextInput({ onFocus, ...props }) {
  const { scrollToField } = useContext(KeyboardScrollContext);
  const inputRef = useRef(null);

  return (
    <TextInput
      ref={inputRef}
      onFocus={(event) => {
        scrollToField(inputRef.current, 120);
        onFocus?.(event);
      }}
      {...props}
    />
  );
}

function formatShortDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatTimeSlot(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}${minutes}H`;
}

function displayValue(value) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildCsvSection(title, columns, rows) {
  const sectionLines = [];

  if (title) {
    sectionLines.push(escapeCsvCell(title));
  }

  sectionLines.push(columns.map((column) => escapeCsvCell(column.label)).join(','));
  rows.forEach((row) => {
    sectionLines.push(
      columns
        .map((column) => escapeCsvCell(displayValue(column.render(row))))
        .join(',')
    );
  });

  return sectionLines.join('\n');
}

function buildExportFileName(tableMode, siteName) {
  const safeSite = String(siteName || 'all-sites')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `reading-history-${tableMode.toLowerCase()}-${safeSite}.csv`;
}

function toAverageNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAverageValue(value) {
  if (value === null || value === undefined) {
    return '-';
  }

  return Number(value).toFixed(2);
}

function dayKeyFromReading(item) {
  const value = item?.slot_datetime || item?.reading_datetime || item?.created_at;
  return String(value || '').slice(0, 10);
}

function averageForField(items, field) {
  const values = items
    .map((item) => toAverageNumber(item[field]))
    .filter((value) => value !== null);

  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function aggregateDailyRows(items, fieldConfigs) {
  const grouped = items.reduce((map, item) => {
    const key = dayKeyFromReading(item);
    if (!key) {
      return map;
    }

    const current = map.get(key) || [];
    current.push(item);
    map.set(key, current);
    return map;
  }, new Map());

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, rows]) => {
      const result = {
        id: `avg:${date}`,
        date,
      };

      fieldConfigs.forEach((config) => {
        result[config.key] = averageForField(rows, config.field);
      });

      return result;
    });
}

function DataTable({ columns, rows, emptyMessage }) {
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);

  if (!rows.length) {
    return (
      <Card>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="document-text-outline" size={18} color={palette.ink900} />
        </View>
        <Text style={styles.emptyTitle}>No readings found</Text>
        <Text style={styles.emptyBody}>{emptyMessage}</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.tableCard}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            {columns.map((column, index) => (
              <View
                key={column.key}
                style={[
                  styles.tableCell,
                  styles.tableHeaderCell,
                  index === 0 && styles.tableFirstCell,
                  column.width ? { width: column.width } : null,
                ]}
              >
                <Text style={styles.tableHeaderText}>{column.label}</Text>
              </View>
            ))}
          </View>

          {rows.map((row, rowIndex) => (
            <View
              key={row.id}
              style={[styles.tableRow, rowIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}
            >
              {columns.map((column, index) => (
                <View
                  key={`${row.id}:${column.key}`}
                  style={[
                    styles.tableCell,
                    index === 0 && styles.tableFirstCell,
                    column.width ? { width: column.width } : null,
                  ]}
                >
                  <Text style={styles.tableCellText}>{displayValue(column.render(row))}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

function ParameterSummary({ title, items }) {
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);

  return (
    <Card style={styles.parameterCard}>
      <View style={styles.parameterHeader}>
        <View style={styles.parameterIconWrap}>
          <Ionicons name="analytics-outline" size={15} color={palette.ink900} />
        </View>
        <Text style={styles.parameterTitle}>{title}</Text>
      </View>
      <Text style={styles.parameterBody}>{items.join(' / ')}</Text>
    </Card>
  );
}

function TableModeChip({ label, active, onPress, iconName }) {
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const iconColor = active ? palette.onAccent : palette.ink700;

  return (
    <Pressable onPress={onPress} style={[styles.modeChip, active && styles.modeChipActive]}>
      <Ionicons name={iconName} size={14} color={iconColor} />
      <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function ReadingHistoryScreen({ navigation, site, source }) {
  const { profile } = useAuth();
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const { width } = useWindowDimensions();
  const isOfficeView = source === 'office-dashboard';
  const isCompactFilters = width < 430;
  const [tableMode, setTableMode] = useState(site?.type || 'CHLORINATION');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [limit, setLimit] = useState('50');
  const [items, setItems] = useState([]);
  const [dailyAverageRows, setDailyAverageRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [pickerTarget, setPickerTarget] = useState(null);

  const chlorinationColumns = [
    { key: 'date', label: 'Date', width: 110, render: (row) => formatShortDateTime(row.slot_datetime).slice(0, 10) },
    { key: 'time', label: 'Time', width: 90, render: (row) => formatTimeSlot(row.slot_datetime) },
    { key: 'pressure', label: 'Pressure', width: 90, render: (row) => row.pressure_psi },
    { key: 'rc', label: 'RC', width: 80, render: (row) => row.rc_ppm },
    { key: 'turbidity', label: 'Turbidity', width: 95, render: (row) => row.turbidity_ntu },
    { key: 'ph', label: 'pH', width: 70, render: (row) => row.ph },
    { key: 'tds', label: 'TDS', width: 80, render: (row) => row.tds_ppm },
    { key: 'tank', label: 'Tank Level', width: 105, render: (row) => row.tank_level_liters },
    { key: 'flowrate', label: 'Flowrate', width: 95, render: (row) => row.flowrate_m3hr },
    { key: 'totalizer', label: 'Totalizer', width: 95, render: (row) => row.totalizer },
    { key: 'chlorine', label: 'Chlorine Used', width: 115, render: (row) => row.chlorine_consumed },
    { key: 'recordedAt', label: 'Recorded At', width: 135, render: (row) => formatShortDateTime(row.reading_datetime) },
    { key: 'recordedBy', label: 'Recorded By', width: 140, render: (row) => row.submitted_profile?.full_name || row.submitted_profile?.email || '-' },
    { key: 'remarks', label: 'Remarks', width: 160, render: (row) => row.remarks || row.status || '-' },
  ];

  const deepwellColumns = [
    { key: 'date', label: 'Date', width: 110, render: (row) => formatShortDateTime(row.slot_datetime).slice(0, 10) },
    { key: 'time', label: 'Time', width: 90, render: (row) => formatTimeSlot(row.slot_datetime) },
    { key: 'upstream', label: 'Upstream', width: 95, render: (row) => row.upstream_pressure_psi },
    { key: 'downstream', label: 'Downstream', width: 105, render: (row) => row.downstream_pressure_psi },
    { key: 'flowrate', label: 'Flowrate', width: 95, render: (row) => row.flowrate_m3hr },
    { key: 'frequency', label: 'Frequency', width: 95, render: (row) => row.vfd_frequency_hz },
    { key: 'l1', label: 'Volt L1', width: 90, render: (row) => row.voltage_l1_v },
    { key: 'l2', label: 'Volt L2', width: 90, render: (row) => row.voltage_l2_v },
    { key: 'l3', label: 'Volt L3', width: 90, render: (row) => row.voltage_l3_v },
    { key: 'amps', label: 'Amperage', width: 95, render: (row) => row.amperage_a },
    { key: 'tds', label: 'TDS', width: 80, render: (row) => row.tds_ppm },
    { key: 'power', label: 'Power kWh', width: 100, render: (row) => row.power_kwh_shift },
    { key: 'recordedAt', label: 'Recorded At', width: 135, render: (row) => formatShortDateTime(row.reading_datetime) },
    { key: 'recordedBy', label: 'Recorded By', width: 140, render: (row) => row.submitted_profile?.full_name || row.submitted_profile?.email || '-' },
    { key: 'remarks', label: 'Remarks', width: 160, render: (row) => row.remarks || row.status || '-' },
  ];

  const genericColumns = [
    { key: 'date', label: 'Date', width: 110, render: (row) => formatShortDateTime(row.slot_datetime).slice(0, 10) },
    { key: 'time', label: 'Time', width: 90, render: (row) => formatTimeSlot(row.slot_datetime) },
    { key: 'site', label: 'Site', width: 170, render: (row) => row.sites?.name || '-' },
    { key: 'type', label: 'Type', width: 110, render: (row) => row.site_type || '-' },
    { key: 'submittedBy', label: 'Submitted by', width: 150, render: (row) => row.submitted_profile?.full_name || row.submitted_profile?.email || '-' },
    { key: 'status', label: 'Status', width: 100, render: (row) => row.status || '-' },
    { key: 'remarks', label: 'Remarks', width: 180, render: (row) => row.remarks || '-' },
  ];

  const chlorinationAverageFields = [
    { key: 'pressure', field: 'pressure_psi', label: 'AVG PRESSURE (PSI)', width: 130 },
    { key: 'rc', field: 'rc_ppm', label: 'AVG RESIDUAL CHLORINE (PPM)', width: 185 },
    { key: 'turbidity', field: 'turbidity_ntu', label: 'AVG TURBIDITY (NTU)', width: 145 },
    { key: 'ph', field: 'ph', label: 'AVG pH', width: 90 },
    { key: 'tds', field: 'tds_ppm', label: 'AVG TDS (PPM)', width: 120 },
    { key: 'tank', field: 'tank_level_liters', label: 'AVG TANK LEVEL (L)', width: 145 },
    { key: 'flowrate', field: 'flowrate_m3hr', label: 'AVG FLOWRATE (M3/HR)', width: 150 },
    { key: 'totalizer', field: 'totalizer', label: 'AVG TOTALIZER', width: 130 },
    { key: 'chlorine', field: 'chlorine_consumed', label: 'AVG CHLORINE USED (KG)', width: 165 },
  ];

  const deepwellAverageFields = [
    { key: 'upstream', field: 'upstream_pressure_psi', label: 'AVG UPSTREAM PRESSURE (PSI)', width: 190 },
    { key: 'downstream', field: 'downstream_pressure_psi', label: 'AVG DOWNSTREAM PRESSURE (PSI)', width: 210 },
    { key: 'flowrate', field: 'flowrate_m3hr', label: 'AVG FLOWRATE (M3/HR)', width: 150 },
    { key: 'frequency', field: 'vfd_frequency_hz', label: 'AVG VFD FREQUENCY (HZ)', width: 160 },
    { key: 'l1', field: 'voltage_l1_v', label: 'AVG VOLTAGE L1 (V)', width: 145 },
    { key: 'l2', field: 'voltage_l2_v', label: 'AVG VOLTAGE L2 (V)', width: 145 },
    { key: 'l3', field: 'voltage_l3_v', label: 'AVG VOLTAGE L3 (V)', width: 145 },
    { key: 'amps', field: 'amperage_a', label: 'AVG AMPERAGE (A)', width: 130 },
    { key: 'tds', field: 'tds_ppm', label: 'AVG TDS (PPM)', width: 120 },
    { key: 'power', field: 'power_kwh_shift', label: 'AVG POWER KWH', width: 130 },
  ];

  const dailyAverageColumns =
    tableMode === 'CHLORINATION'
      ? [
          { key: 'date', label: 'DATE', width: 120, render: (row) => row.date },
          ...chlorinationAverageFields.map((field) => ({
            key: field.key,
            label: field.label,
            width: field.width,
            render: (row) => formatAverageValue(row[field.key]),
          })),
        ]
      : tableMode === 'DEEPWELL'
        ? [
            { key: 'date', label: 'DATE', width: 120, render: (row) => row.date },
            ...deepwellAverageFields.map((field) => ({
              key: field.key,
              label: field.label,
              width: field.width,
              render: (row) => formatAverageValue(row[field.key]),
            })),
          ]
        : [];

  const activeColumns =
    tableMode === 'CHLORINATION'
      ? chlorinationColumns
      : tableMode === 'DEEPWELL'
        ? deepwellColumns
        : genericColumns;

  const parameterSummary =
    tableMode === 'CHLORINATION'
      ? ['Pressure', 'RC', 'Turbidity', 'pH', 'TDS', 'Tank Level', 'Flowrate', 'Totalizer', 'Chlorine Used', 'Recorded At', 'Recorded By', 'Remarks']
      : tableMode === 'DEEPWELL'
        ? ['Upstream Pressure', 'Downstream Pressure', 'Flowrate', 'Frequency', 'Voltage L1', 'Voltage L2', 'Voltage L3', 'Amperage', 'TDS', 'Power kWh', 'Recorded At', 'Recorded By', 'Remarks']
        : ['Site', 'Type', 'Submitted By', 'Status', 'Remarks'];

  async function loadHistory(nextFilters) {
    setLoading(true);
    setMessage('');

    const effectiveTableMode = nextFilters?.tableMode ?? tableMode;
    const effectiveFromDate = nextFilters?.fromDate ?? fromDate;
    const effectiveToDate = nextFilters?.toDate ?? toDate;
    const effectiveLimit = nextFilters?.limit ?? limit;
    const safeLimit = Math.min(200, Math.max(1, Number(effectiveLimit) || 50));

    if (effectiveFromDate && effectiveToDate && effectiveFromDate > effectiveToDate) {
      setItems([]);
      setLoading(false);
      setMessage('The "from" date must be on or before the "to" date.');
      return;
    }

    try {
      const filters = {
        siteId: site?.id || undefined,
        siteType: effectiveTableMode,
        fromDate: effectiveFromDate.trim() || undefined,
        toDate: effectiveToDate.trim() || undefined,
      };

      const [nextItems, averagingItems] = await Promise.all([
        listReadings({
          ...filters,
          limit: safeLimit,
        }),
        listReadings({
          ...filters,
          limit: undefined,
        }),
      ]);

      const averageRows =
        effectiveTableMode === 'CHLORINATION'
          ? aggregateDailyRows(averagingItems, chlorinationAverageFields)
          : effectiveTableMode === 'DEEPWELL'
            ? aggregateDailyRows(averagingItems, deepwellAverageFields)
            : [];

      setItems(nextItems);
      setDailyAverageRows(averageRows);
      setMessage(
        `Showing ${nextItems.length} ${effectiveTableMode.toLowerCase()} record(s) and ${averageRows.length} daily average row(s).`
      );
    } catch (error) {
      setItems([]);
      setDailyAverageRows([]);
      setMessage(error.message || 'Failed to load readings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  function handleNativeDateChange(_event, selectedDate) {
    const target = pickerTarget;
    setPickerTarget(null);

    if (!selectedDate || !target) {
      return;
    }

    const formatted = formatDateValue(selectedDate);

    if (target === 'from') {
      setFromDate(formatted);
    } else {
      setToDate(formatted);
    }
  }

  async function handleExportCsv() {
    if (!items.length && !dailyAverageRows.length) {
      setMessage('Load some reading history first before exporting to CSV.');
      return;
    }

    setExporting(true);

    try {
      const sections = [];

      if ((tableMode === 'CHLORINATION' || tableMode === 'DEEPWELL') && dailyAverageRows.length) {
        sections.push(buildCsvSection('Daily Average Values', dailyAverageColumns, dailyAverageRows));
      }

      if (items.length) {
        sections.push(buildCsvSection('Detailed Reading History', activeColumns, items));
      }

      const csvContent = sections.join('\n\n');
      const fileName = buildExportFileName(tableMode, site?.name);

      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export reading history CSV',
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          await Share.share({
            message: csvContent,
            title: fileName,
          });
        }
      }

      setMessage('CSV export is ready.');
    } catch (error) {
      setMessage(error.message || 'Failed to export CSV.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScreenShell
      eyebrow={isOfficeView ? 'Office readings' : 'History'}
      title="Reading History"
      subtitle={
        isOfficeView
          ? 'Review full reading history from the office side with site and date range filters.'
          : `Review submitted readings for ${profile?.full_name || profile?.email || 'your account'}.`
      }
      keyboardAware
      keyboardAwareProps={{
        extraScrollHeight: 88,
        extraHeight: 120,
      }}
    >
      {isOfficeView ? (
        <View style={styles.topBackRow}>
          <Pressable onPress={navigation.goBack} style={styles.topBackButton}>
            <Ionicons name="arrow-back" size={14} color={palette.ink900} />
            <Text style={styles.topBackButtonText}>Back to dashboard</Text>
          </Pressable>
        </View>
      ) : null}

      <Card style={styles.filterCard}>
        <View style={styles.filterTitleRow}>
          <View style={styles.filterTitleIcon}>
            <Ionicons name="funnel-outline" size={15} color={palette.ink900} />
          </View>
          <Text style={styles.filterTitle}>{isOfficeView ? 'Office filters' : 'Filters'}</Text>
        </View>
        <View style={styles.filterField}>
          <Text style={styles.filterLabel}>Table view</Text>
          <View style={styles.modeRow}>
            <TableModeChip
              label="Chlorination"
              iconName="water-outline"
              active={tableMode === 'CHLORINATION'}
              onPress={async () => {
                setTableMode('CHLORINATION');
                await loadHistory({ tableMode: 'CHLORINATION' });
              }}
            />
            <TableModeChip
              label="Deepwell"
              iconName="flash-outline"
              active={tableMode === 'DEEPWELL'}
              onPress={async () => {
                setTableMode('DEEPWELL');
                await loadHistory({ tableMode: 'DEEPWELL' });
              }}
            />
          </View>
        </View>

        {Platform.OS === 'web' ? (
          <View style={[styles.dateRangeRow, isCompactFilters && styles.dateRangeRowCompact]}>
            <View style={[styles.filterField, styles.dateRangeField, isCompactFilters && styles.dateRangeFieldCompact]}>
              <Text style={styles.filterLabel}>From date</Text>
              <View style={styles.inputShell}>
                <View style={styles.inputIconWrap}>
                  <Ionicons name="calendar-outline" size={15} color={palette.ink500} />
                </View>
                <ScrollAwareTextInput
                  value={fromDate}
                  onChangeText={setFromDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={palette.ink500}
                  style={styles.filterInput}
                />
              </View>
            </View>

            <View style={[styles.filterField, styles.dateRangeField, isCompactFilters && styles.dateRangeFieldCompact]}>
              <Text style={styles.filterLabel}>To date</Text>
              <View style={styles.inputShell}>
                <View style={styles.inputIconWrap}>
                  <Ionicons name="calendar-clear-outline" size={15} color={palette.ink500} />
                </View>
                <ScrollAwareTextInput
                  value={toDate}
                  onChangeText={setToDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={palette.ink500}
                  style={styles.filterInput}
                />
              </View>
            </View>

            <View style={[styles.filterField, styles.limitInlineField, isCompactFilters && styles.limitInlineFieldCompact]}>
              <Text style={styles.filterLabel}>Limit</Text>
              <View style={styles.inputShell}>
                <View style={styles.inputIconWrap}>
                  <Ionicons name="list-outline" size={15} color={palette.ink500} />
                </View>
                <ScrollAwareTextInput
                  value={limit}
                  onChangeText={setLimit}
                  keyboardType="number-pad"
                  placeholder="50"
                  placeholderTextColor={palette.ink500}
                  style={styles.filterInput}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.dateRangeRow, isCompactFilters && styles.dateRangeRowCompact]}>
            <View style={[styles.dateRangeField, isCompactFilters && styles.dateRangeFieldCompact]}>
              <MobileDateField
                label="From date"
                value={fromDate}
                placeholder="Start date"
                onPress={() => setPickerTarget('from')}
              />
            </View>
            <View style={[styles.dateRangeField, isCompactFilters && styles.dateRangeFieldCompact]}>
              <MobileDateField
                label="To date"
                value={toDate}
                placeholder="End date"
                onPress={() => setPickerTarget('to')}
              />
            </View>
            <View style={[styles.filterField, styles.limitInlineField, isCompactFilters && styles.limitInlineFieldCompact]}>
              <Text style={styles.filterLabel}>Limit</Text>
              <View style={styles.inputShell}>
                <View style={styles.inputIconWrap}>
                  <Ionicons name="list-outline" size={15} color={palette.ink500} />
                </View>
                <ScrollAwareTextInput
                  value={limit}
                  onChangeText={setLimit}
                  keyboardType="number-pad"
                  placeholder="50"
                  placeholderTextColor={palette.ink500}
                  style={styles.filterInput}
                />
              </View>
            </View>
          </View>
        )}

        <View style={styles.filterActions}>
          {!isOfficeView ? (
            <View style={styles.actionItem}>
              <PrimaryButton
                label="Back"
                onPress={navigation.goBack}
                tone="secondary"
                icon={<Ionicons name="arrow-back" size={16} color={palette.ink900} />}
              />
            </View>
          ) : null}
          <View style={styles.actionItem}>
            <PrimaryButton
              label="Clear"
              onPress={async () => {
                setFromDate('');
                setToDate('');
                setLimit('50');
                await loadHistory({
                  tableMode,
                  fromDate: '',
                  toDate: '',
                  limit: '50',
                });
              }}
              tone="secondary"
              icon={<Ionicons name="refresh-outline" size={16} color={palette.ink900} />}
            />
          </View>
          <View style={styles.actionItem}>
            <PrimaryButton
              label="Load"
              onPress={loadHistory}
              loading={loading}
              icon={<Ionicons name="download-outline" size={16} color={palette.onAccent} />}
            />
          </View>
          <View style={styles.actionItem}>
            <PrimaryButton
              label={exporting ? 'Exporting...' : 'Export CSV'}
              onPress={handleExportCsv}
              loading={exporting}
              tone="secondary"
              icon={<Ionicons name="document-text-outline" size={16} color={palette.ink900} />}
            />
          </View>
        </View>

        {pickerTarget && Platform.OS !== 'web' ? (
          <DateTimePicker
            value={parseDateValue(pickerTarget === 'from' ? fromDate : toDate) || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleNativeDateChange}
          />
        ) : null}
      </Card>

      {message ? <MessageBanner tone={items.length ? 'success' : 'info'}>{message}</MessageBanner> : null}

      <ParameterSummary
        title="Parameters shown"
        items={parameterSummary}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.teal600} />
        </View>
      ) : (
        <View style={styles.resultsStack}>
          {(tableMode === 'CHLORINATION' || tableMode === 'DEEPWELL') ? (
            <>
              <Card style={styles.averageIntroCard}>
                <View style={styles.averageIntroHeader}>
                  <View style={styles.averageIntroIcon}>
                    <Ionicons name="calculator-outline" size={15} color={palette.ink900} />
                  </View>
                  <Text style={styles.averageIntroTitle}>Daily average values</Text>
                </View>
                <Text style={styles.averageIntroBody}>
                  Averages are calculated per day from all matching 30-minute readings in the selected date range.
                </Text>
              </Card>

              <DataTable
                columns={dailyAverageColumns}
                rows={dailyAverageRows}
                emptyMessage={`No daily averages can be calculated yet for ${tableMode.toLowerCase()}.`}
              />
            </>
          ) : null}

          <DataTable
            columns={activeColumns}
            rows={items}
            emptyMessage={
              `Try another date range or confirm ${tableMode.toLowerCase()} readings have already been submitted to the database.`
            }
          />
        </View>
      )}
    </ScreenShell>
  );
}

function createStyles(palette, isDark) {
  return StyleSheet.create({
    topBackRow: {
      alignItems: 'flex-start',
    },
    topBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? '#1A655E' : '#B4E5DE',
      backgroundColor: isDark ? '#11312D' : '#E5F5F3',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    topBackButtonText: {
      color: palette.ink900,
      fontSize: 12,
      fontWeight: '800',
    },
    filterCard: {
      gap: 10,
      padding: 12,
    },
    filterTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    filterTitleIcon: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
    },
    filterTitle: {
      color: palette.ink900,
      fontSize: 16,
      fontWeight: '800',
    },
    filterField: {
      gap: 6,
    },
    filterLabel: {
      color: palette.ink700,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    dateRangeRow: {
      flexDirection: 'row',
      gap: 8,
    },
    dateRangeRowCompact: {
      flexWrap: 'wrap',
    },
    dateRangeField: {
      flex: 1,
    },
    dateRangeFieldCompact: {
      minWidth: 0,
      flexBasis: '48%',
    },
    filterInput: {
      minHeight: 44,
      flex: 1,
      paddingVertical: 10,
      color: palette.ink900,
      fontSize: 13,
    },
    inputShell: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.lineStrong,
      backgroundColor: isDark ? '#0C1621' : '#F9FCFF',
      paddingHorizontal: 12,
    },
    inputRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inputIconWrap: {
      width: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    limitInlineField: {
      width: 88,
    },
    limitInlineFieldCompact: {
      width: '100%',
    },
    modeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    modeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: isDark ? '#132131' : '#F3F8FD',
      borderWidth: 1,
      borderColor: palette.line,
    },
    modeChipActive: {
      backgroundColor: palette.navy700,
      borderColor: palette.cyan300,
    },
    modeChipText: {
      color: palette.ink700,
      fontSize: 11,
      fontWeight: '700',
    },
    modeChipTextActive: {
      color: palette.onAccent,
    },
    dateField: {
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.lineStrong,
      backgroundColor: isDark ? '#0C1621' : '#F9FCFF',
      paddingHorizontal: 12,
      paddingVertical: 10,
      justifyContent: 'center',
    },
    dateFieldValue: {
      flex: 1,
      flexShrink: 1,
      color: palette.ink900,
      fontSize: 13,
    },
    dateFieldPlaceholder: {
      color: palette.ink500,
    },
    filterActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    actionItem: {
      flex: 1,
      minWidth: 92,
    },
    loadingWrap: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 28,
    },
    resultsStack: {
      gap: 12,
    },
    averageIntroCard: {
      gap: 6,
    },
    averageIntroHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    averageIntroIcon: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
    },
    averageIntroTitle: {
      color: palette.ink900,
      fontSize: 15,
      fontWeight: '800',
    },
    averageIntroBody: {
      color: palette.ink700,
      fontSize: 12,
      lineHeight: 18,
    },
    tableCard: {
      padding: 0,
      overflow: 'hidden',
    },
    parameterCard: {
      gap: 6,
    },
    parameterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    parameterIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
    },
    parameterTitle: {
      color: palette.ink900,
      fontSize: 15,
      fontWeight: '800',
    },
    parameterBody: {
      color: palette.ink700,
      fontSize: 13,
      lineHeight: 20,
    },
    tableRow: {
      flexDirection: 'row',
    },
    tableHeaderRow: {
      backgroundColor: palette.navy900,
    },
    tableRowEven: {
      backgroundColor: isDark ? '#0B1520' : '#F8FBFE',
    },
    tableRowOdd: {
      backgroundColor: palette.card,
    },
    tableCell: {
      width: 110,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: palette.line,
      justifyContent: 'center',
    },
    tableHeaderCell: {
      borderColor: isDark ? '#2B4259' : '#29476D',
    },
    tableFirstCell: {
      borderLeftWidth: 0,
    },
    tableHeaderText: {
      color: palette.onAccent,
      fontSize: 12,
      fontWeight: '800',
    },
    tableCellText: {
      color: palette.ink700,
      fontSize: 12,
      lineHeight: 16,
    },
    emptyTitle: {
      marginTop: 10,
      color: palette.ink900,
      fontSize: 17,
      fontWeight: '800',
    },
    emptyBody: {
      marginTop: 8,
      color: palette.ink700,
      fontSize: 14,
      lineHeight: 20,
    },
    emptyIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
    },
  });
}
