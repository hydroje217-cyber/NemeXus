import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
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
import * as Print from 'expo-print';
import * as XLSX from 'xlsx';
import Card from '../components/Card';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell, { KeyboardScrollContext } from '../components/ScreenShell';
import { EmptyState, LoadingState, SegmentChip, SplitExportButton } from '../components/UiControls';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { listReadings } from '../services/readings';
import { getResponsiveMetrics, scaleStyleDefinitions } from '../theme';
import { saveNativeExportFile, buildNativeExportSuccessMessage } from '../utils/exportFiles';
import { aggregateDailyRows } from '../utils/production';

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;
const MAX_AVERAGE_SOURCE_LIMIT = 500;
const EDIT_WINDOW_MS = 5 * 60 * 1000;
const SHIFT_OPTIONS = [
  { key: 'all', label: 'All shifts' },
  { key: 'a', label: 'A-Shift' },
  { key: 'b', label: 'B-Shift' },
  { key: 'c', label: 'C-Shift' },
];
const SHIFT_SORT_ORDER = {
  c: 0,
  b: 1,
  a: 2,
};
const LOGSHEET_TIME_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}${String(mins).padStart(2, '0')}H`;
});
const LOGSHEET_SHIFT_ROWS = [
  { label: 'C-Shift', slots: LOGSHEET_TIME_SLOTS.slice(0, 14) },
  { label: 'A-Shift', slots: LOGSHEET_TIME_SLOTS.slice(14, 30) },
  { label: 'B-Shift', slots: LOGSHEET_TIME_SLOTS.slice(30, 46) },
  { label: 'C-Shift', slots: LOGSHEET_TIME_SLOTS.slice(46) },
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

function formatDateValue(date) {
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDateValue(value, days) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return value;
  }

  parsed.setDate(parsed.getDate() + days);
  return formatDateValue(parsed);
}

function previousAndCurrentDayDateValues() {
  const currentDay = new Date();
  const previousDay = new Date(currentDay);
  previousDay.setDate(currentDay.getDate() - 1);

  return {
    fromDate: formatDateValue(previousDay),
    toDate: formatDateValue(currentDay),
  };
}

function supportsDailyAverageMode(siteType) {
  return siteType === 'CHLORINATION' || siteType === 'DEEPWELL';
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
  const { width } = useWindowDimensions();
  const responsiveMetrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, responsiveMetrics), [palette, isDark, responsiveMetrics]);

  return (
    <View style={styles.filterField}>
      <Text style={styles.filterLabel}>{label}</Text>
      <Pressable onPress={onPress} style={[styles.dateField, styles.compactDateField]}>
        <View style={styles.inputRow}>
          <View style={styles.inputIconWrap}>
            <Ionicons name="calendar-outline" size={15} color={palette.ink500} />
          </View>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.dateFieldValue, styles.compactDateFieldValue, !value && styles.dateFieldPlaceholder]}
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

function getShiftKeyForDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 7 * 60 && minutes < 15 * 60) {
    return 'a';
  }

  if (minutes >= 15 * 60 && minutes < 23 * 60) {
    return 'b';
  }

  return 'c';
}

function getShiftLabel(value) {
  const shiftKey = getShiftKeyForDate(value);
  return shiftKey ? `${shiftKey.toUpperCase()}-Shift` : '-';
}

function getShiftStartTime(row) {
  const slotDate = new Date(row?.slot_datetime || row?.reading_datetime || 0);
  if (Number.isNaN(slotDate.getTime())) {
    return 0;
  }

  const shiftKey = getShiftKeyForDate(slotDate);
  if (shiftKey === 'a') {
    return new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), 7).getTime();
  }

  if (shiftKey === 'b') {
    return new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), 15).getTime();
  }

  const cShiftDayOffset = slotDate.getHours() < 7 ? -1 : 0;
  return new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate() + cShiftDayOffset, 23).getTime();
}

function arrangeRowsByShift(rows, shiftFilter = 'all') {
  return [...rows]
    .filter((row) => shiftFilter === 'all' || getShiftKeyForDate(row.slot_datetime || row.reading_datetime) === shiftFilter)
    .sort((a, b) => {
      const shiftDiff = getShiftStartTime(b) - getShiftStartTime(a);
      if (shiftDiff !== 0) {
        return shiftDiff;
      }

      const aShift = getShiftKeyForDate(a.slot_datetime || a.reading_datetime);
      const bShift = getShiftKeyForDate(b.slot_datetime || b.reading_datetime);
      const orderDiff = (SHIFT_SORT_ORDER[aShift] ?? 99) - (SHIFT_SORT_ORDER[bShift] ?? 99);
      if (orderDiff !== 0) {
        return orderDiff;
      }

      return new Date(b.slot_datetime || b.reading_datetime || 0).getTime() - new Date(a.slot_datetime || a.reading_datetime || 0).getTime();
    });
}

function getLocalDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Undated';
  }

  return formatDateValue(date);
}

function getReadingSiteName(row) {
  return row?.sites?.name || row?.site?.name || 'All sites';
}

function sanitizeSheetName(value) {
  return String(value || 'Sheet')
    .replace(/[:\\/?*[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet';
}

function appendUniqueSheet(workbook, sheet, baseName) {
  const existingNames = new Set(workbook.SheetNames);
  const safeBase = sanitizeSheetName(baseName);
  let name = safeBase;
  let index = 2;

  while (existingNames.has(name)) {
    const suffix = ` ${index}`;
    name = sanitizeSheetName(`${safeBase.slice(0, 31 - suffix.length)}${suffix}`);
    index += 1;
  }

  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function groupRowsByLogsheet(rows) {
  return rows.reduce((groups, row) => {
    const dateKey = getLocalDateKey(row.slot_datetime || row.reading_datetime);
    const siteName = getReadingSiteName(row);
    const groupKey = `${dateKey}::${siteName}`;

    if (!groups[groupKey]) {
      groups[groupKey] = {
        dateKey,
        siteName,
        rows: [],
      };
    }

    groups[groupKey].rows.push(row);
    return groups;
  }, {});
}

function indexRowsByTime(rows) {
  return rows.reduce((indexed, row) => {
    const time = formatTimeSlot(row.slot_datetime || row.reading_datetime);
    indexed[time] = row;
    return indexed;
  }, {});
}

function getSubmitterName(row) {
  return row?.submitted_profile?.full_name || row?.submitted_profile?.email || '';
}

function getShiftRows(rows, shiftKey) {
  return rows.filter((row) => getShiftKeyForDate(row.slot_datetime || row.reading_datetime) === shiftKey);
}

function getLatestShiftRow(rows, shiftKey) {
  return getShiftRows(rows, shiftKey).sort(
    (a, b) => new Date(b.slot_datetime || b.reading_datetime || 0).getTime() - new Date(a.slot_datetime || a.reading_datetime || 0).getTime()
  )[0];
}

function sumShiftField(rows, shiftKey, field) {
  const total = getShiftRows(rows, shiftKey).reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
  return total || '';
}

function latestShiftValue(rows, shiftKey, field) {
  const row = getShiftRows(rows, shiftKey)
    .filter((item) => item[field] !== null && item[field] !== undefined && item[field] !== '')
    .sort((a, b) => new Date(b.slot_datetime || b.reading_datetime || 0).getTime() - new Date(a.slot_datetime || a.reading_datetime || 0).getTime())[0];

  return row?.[field] ?? '';
}

function firstNumber(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== '') ?? '';
}

function buildChlorinationLogsheet({ dateKey, siteName, rows }) {
  const indexedRows = indexRowsByTime(rows);
  const aoa = [
    ['DAILY MONITORING LOG SHEET', '', '', '', '', '', '', '', '', 'CHLORINATION HOUSE', '', '', '', '', '', ''],
    ['Date:', dateKey, '', '', '', '', '', '', '', 'Site:', siteName, '', '', '', '', ''],
    ['Time', 'Pressure', 'Analysis', '', '', '', '', 'Flowmeter', '', 'STATUS / REMARKS', '', '', '', '', '', ''],
    ['', '', 'RC', 'Turbidity', 'pH', 'TDS', 'Tank Level', 'Flowrate', 'Totalizer', '', '', '', '', '', '', ''],
    ['', 'psi', 'ppm', 'ntu', '', 'ppm', 'liters', 'm3/hr', 'm3', '', '', '', '', '', '', ''],
  ];

  LOGSHEET_SHIFT_ROWS.forEach((shift) => {
    aoa.push([shift.label, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    shift.slots.forEach((slot) => {
      const row = indexedRows[slot] || {};
      aoa.push([
        slot,
        firstNumber(row.pressure_psi),
        firstNumber(row.rc_ppm),
        firstNumber(row.turbidity_ntu),
        firstNumber(row.ph),
        firstNumber(row.tds_ppm),
        firstNumber(row.tank_level_liters),
        firstNumber(row.flowrate_m3hr),
        firstNumber(row.totalizer),
        row.remarks || row.status || '',
        '',
        '',
        '',
        '',
        '',
        getSubmitterName(row),
      ]);
    });
  });

  aoa.push([]);
  aoa.push(['READING TIME', '', 'TOTALIZER (m3)', '', '', 'PRODUCTION (m3)', '', '', 'CHLORINE USAGE (kg)', '', 'PEROXIDE CONSUMPTION', '', 'POWER CONSUMPTION (KWH)', '', 'FIELDMAN', '']);
  [
    ['A-Shift', '(0700H)', 'a'],
    ['B-Shift', '(1500H)', 'b'],
    ['C-Shift', '(2400H)', 'c'],
  ].forEach(([label, time, shiftKey]) => {
    const latestRow = getLatestShiftRow(rows, shiftKey);
    aoa.push([
      label,
      time,
      latestRow?.totalizer ?? '',
      '',
      '',
      '',
      '',
      '',
      latestShiftValue(rows, shiftKey, 'chlorine_consumed'),
      '',
      latestShiftValue(rows, shiftKey, 'peroxide_consumption'),
      '',
      latestShiftValue(rows, shiftKey, 'chlorination_power_kwh'),
      '',
      getSubmitterName(latestRow),
      '',
    ]);
  });

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 9 },
    { wch: 10 },
    { wch: 10 },
    { wch: 11 },
    { wch: 8 },
    { wch: 9 },
    { wch: 12 },
    { wch: 11 },
    { wch: 11 },
    { wch: 18 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 10 },
    { wch: 18 },
  ];
  sheet['!merges'] = [
    XLSX.utils.decode_range('A1:I1'),
    XLSX.utils.decode_range('J1:L1'),
    XLSX.utils.decode_range('C3:G3'),
    XLSX.utils.decode_range('H3:I3'),
    XLSX.utils.decode_range('J3:L5'),
    XLSX.utils.decode_range('A59:B59'),
    XLSX.utils.decode_range('C59:E59'),
    XLSX.utils.decode_range('F59:H59'),
    XLSX.utils.decode_range('I59:J59'),
    XLSX.utils.decode_range('K59:L59'),
    XLSX.utils.decode_range('M59:N59'),
    XLSX.utils.decode_range('O59:P59'),
  ];
  return sheet;
}

function buildDeepwellLogsheet({ dateKey, siteName, rows }) {
  const indexedRows = indexRowsByTime(rows);
  const aoa = [
    ['DAILY MONITORING LOG SHEET', '', '', '', '', '', '', '', '', 'DEEP WELL HOUSE', '', ''],
    ['Date:', dateKey, '', '', '', '', '', '', '', 'Site:', siteName, ''],
    ['Time', 'Upstream Pressure', 'Downstream Pressure', 'Flow rate', 'Frequency', 'Voltage (V)', '', '', 'Amperage', 'TDS', 'Remarks', ''],
    ['', 'psi', 'psi', 'm3/hr', 'Hz', 'L1', 'L2', 'L3', 'A', 'ppm', '', ''],
  ];

  LOGSHEET_SHIFT_ROWS.forEach((shift) => {
    aoa.push([shift.label, '', '', '', '', '', '', '', '', '', '', '']);
    shift.slots.forEach((slot) => {
      const row = indexedRows[slot] || {};
      aoa.push([
        slot,
        firstNumber(row.upstream_pressure_psi),
        firstNumber(row.downstream_pressure_psi),
        firstNumber(row.flowrate_m3hr),
        firstNumber(row.vfd_frequency_hz),
        firstNumber(row.voltage_l1_v),
        firstNumber(row.voltage_l2_v),
        firstNumber(row.voltage_l3_v),
        firstNumber(row.amperage_a),
        firstNumber(row.tds_ppm),
        row.remarks || row.status || '',
        getSubmitterName(row),
      ]);
    });
  });

  aoa.push([]);
  aoa.push(['READING TIME', '', '', 'POWER READING (KWH)', '', '', 'CONSUMPTION (KWH)', '', '', 'FIELDMAN', '', '']);
  [
    ['A-Shift', '(0700H)', 'a'],
    ['B-Shift', '(1500H)', 'b'],
    ['C-Shift', '(2400H)', 'c'],
  ].forEach(([label, time, shiftKey]) => {
    const latestRow = getLatestShiftRow(rows, shiftKey);
    aoa.push([
      label,
      time,
      '',
      latestRow?.power_kwh_shift ?? '',
      '',
      '',
      sumShiftField(rows, shiftKey, 'power_kwh_shift'),
      '',
      '',
      getSubmitterName(latestRow),
      '',
      '',
    ]);
  });

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 9 },
    { wch: 14 },
    { wch: 15 },
    { wch: 11 },
    { wch: 11 },
    { wch: 9 },
    { wch: 9 },
    { wch: 9 },
    { wch: 10 },
    { wch: 9 },
    { wch: 20 },
    { wch: 18 },
  ];
  sheet['!merges'] = [
    XLSX.utils.decode_range('A1:I1'),
    XLSX.utils.decode_range('J1:L1'),
    XLSX.utils.decode_range('F3:H3'),
    XLSX.utils.decode_range('K3:L4'),
    XLSX.utils.decode_range('A58:C58'),
    XLSX.utils.decode_range('D58:F58'),
    XLSX.utils.decode_range('G58:I58'),
    XLSX.utils.decode_range('J58:L58'),
  ];
  return sheet;
}

function appendLogsheetSheets(workbook, rows, tableMode) {
  const groupedRows = groupRowsByLogsheet(rows);
  Object.values(groupedRows)
    .sort((a, b) => `${a.dateKey} ${a.siteName}`.localeCompare(`${b.dateKey} ${b.siteName}`))
    .forEach((group) => {
      const sheet =
        tableMode === 'DEEPWELL'
          ? buildDeepwellLogsheet(group)
          : buildChlorinationLogsheet(group);
      const prefix = tableMode === 'DEEPWELL' ? 'DW' : 'CH';
      appendUniqueSheet(workbook, sheet, `${prefix} ${group.dateKey} ${group.siteName}`);
    });
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

function buildExportFileName(tableMode, siteName, extension = 'csv') {
  const safeSite = String(siteName || 'all-sites')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `reading-history-${tableMode.toLowerCase()}-${safeSite}.${extension}`;
}

function buildTableRows(columns, rows) {
  return [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => displayValue(column.render(row)))),
  ];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPdfSection(title, columns, rows) {
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => `<td>${escapeHtml(displayValue(column.render(row)))}</td>`)
        .join('');

      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `
    <section class="section">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>
  `;
}

function buildPdfDocument({
  tableMode,
  siteName,
  includeAverages,
  dailyAverageColumns,
  dailyAverageRows,
  activeColumns,
  items,
}) {
  const sections = [];

  if (includeAverages) {
    sections.push(buildPdfSection('Daily Average Values', dailyAverageColumns, dailyAverageRows));
  }

  if (items.length) {
    sections.push(buildPdfSection('Detailed Reading History', activeColumns, items));
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; padding: 24px; }
          h1 { margin: 0 0 6px; font-size: 24px; }
          .meta { margin: 0 0 18px; color: #475569; font-size: 12px; }
          .section { margin-top: 20px; }
          h2 { margin: 0 0 10px; font-size: 16px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; word-wrap: break-word; }
          th { background: #0f766e; color: #ffffff; font-weight: 700; }
          tr:nth-child(even) td { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>Reading History Export</h1>
        <p class="meta">Site: ${escapeHtml(siteName || 'All sites')} | Table: ${escapeHtml(tableMode)}</p>
        ${sections.join('')}
      </body>
    </html>
  `;
}

function formatAverageValue(value) {
  if (value === null || value === undefined) {
    return '-';
  }

  return Number(value).toFixed(2);
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

  const readingType = String(reading.site_type || reading.site?.type || reading.sites?.type || '').toLowerCase();
  const fields = readingType === 'deepwell' ? DEEPWELL_READING_FIELDS : CHLORINATION_READING_FIELDS;
  return fields
    .filter(({ key }) => reading[key] !== null && reading[key] !== undefined && reading[key] !== '')
    .map((field) => ({
      label: field.label,
      value: formatRecordedValue(reading[field.key], field.unit),
    }));
}

function formatMaybeHistoryTimestamp(value) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatShortDateTime(parsed);
}

function getReadingSummaryTitle(row) {
  return row?.sites?.name || row?.site?.name || row?.date || 'Recorded values';
}

function getReadingSummaryMeta(row) {
  return row?.slot_datetime ? formatTimeSlot(row.slot_datetime) : formatMaybeHistoryTimestamp(row?.reading_datetime);
}

function getReadingOperatorName(row) {
  return row?.submitted_profile?.full_name || row?.submitted_profile?.email || '-';
}

function getReadingSite(row) {
  const relatedSite = row?.sites || row?.site || {};

  return {
    id: row?.site_id || relatedSite.id,
    name: relatedSite.name || row?.site_name || getReadingSummaryTitle(row),
    type: row?.site_type || relatedSite.type,
  };
}

function getEditWindowRemainingMs(row, now) {
  if (!row?.created_at) {
    return 0;
  }

  const savedTime = new Date(row.created_at).getTime();
  if (!Number.isFinite(savedTime)) {
    return 0;
  }

  return Math.max(0, savedTime + EDIT_WINDOW_MS - now.getTime());
}

function formatEditCountdown(remainingMs) {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function DataTable({ columns, rows, emptyMessage, onEditReading }) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const responsiveMetrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, responsiveMetrics), [palette, isDark, responsiveMetrics]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [timerNow, setTimerNow] = useState(() => new Date());

  useEffect(() => {
    setSelectedRow(null);
  }, [rows]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimerNow(new Date());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  if (!rows.length) {
    return (
      <Card>
        <EmptyState
          title="No readings found"
          body={emptyMessage}
          iconName="document-text-outline"
        />
      </Card>
    );
  }

  const summaryRows = getRecordedValueRows(selectedRow);
  const submitter = getReadingOperatorName(selectedRow);
  const editRemainingMs = getEditWindowRemainingMs(selectedRow, timerNow);
  const canEditSelectedReading = editRemainingMs > 0;

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

          {rows.map((row, rowIndex) => {
            const isSelected = selectedRow?.id === row.id;

            return (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel="Open reading summary"
                onPress={() => setSelectedRow(row)}
                style={({ pressed }) => [
                  styles.tableRow,
                  rowIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd,
                  isSelected && styles.tableRowSelected,
                  pressed && !isSelected ? styles.tableRowPressed : null,
                ]}
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
                    <Text style={[styles.tableCellText, isSelected && styles.tableCellTextSelected]}>
                      {displayValue(column.render(row))}
                    </Text>
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedRow)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedRow(null)}
      >
        <View style={styles.readingSummaryOverlay}>
          <Pressable style={styles.readingSummaryBackdrop} onPress={() => setSelectedRow(null)} />
          <View style={styles.readingSummarySheet}>
            <View style={styles.readingSummaryHeader}>
              <View style={styles.readingSummaryTitleWrap}>
                <Text style={styles.readingSummaryEyebrow}>
                  {selectedRow?.site_type || selectedRow?.site?.type || selectedRow?.sites?.type || 'Reading'}
                </Text>
                <Text style={styles.readingSummaryTitle} numberOfLines={2}>
                  {getReadingSummaryTitle(selectedRow)}
                </Text>
                <Text style={styles.readingSummaryMeta}>
                  {getReadingSummaryMeta(selectedRow)}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedRow(null)} style={styles.readingSummaryClose}>
                <Ionicons name="close" size={18} color={palette.ink700} />
              </Pressable>
            </View>

            <View style={styles.readingSummaryMetaGrid}>
              <View style={styles.readingSummaryMetaTile}>
                <Text style={styles.readingSummaryMetaLabel}>Submitted by</Text>
                <Text style={styles.readingSummaryMetaValue} numberOfLines={2}>{submitter}</Text>
              </View>
              <View style={styles.readingSummaryMetaTile}>
                <Text style={styles.readingSummaryMetaLabel}>Saved</Text>
                <Text style={styles.readingSummaryMetaValue}>{formatMaybeHistoryTimestamp(selectedRow?.created_at)}</Text>
              </View>
            </View>

            <ScrollView style={styles.readingSummaryScroll} contentContainerStyle={styles.readingSummaryList}>
              {summaryRows.length ? (
                summaryRows.map((item) => (
                  <View key={item.label} style={styles.readingSummaryRow}>
                    <Text style={styles.readingSummaryLabel}>{item.label}</Text>
                    <Text style={styles.readingSummaryValue}>{item.value}</Text>
                  </View>
                ))
              ) : (
                <MessageBanner tone="info">No numeric values were saved for this reading.</MessageBanner>
              )}

              {selectedRow?.remarks ? (
                <View style={styles.readingSummaryRemarks}>
                  <Text style={styles.readingSummaryLabel}>Remarks</Text>
                  <Text style={styles.readingSummaryRemarksText}>{selectedRow.remarks}</Text>
                </View>
              ) : null}
            </ScrollView>

            {onEditReading ? (
              <View style={styles.readingSummaryActions}>
                <Pressable
                  onPress={() => {
                    if (!canEditSelectedReading || !selectedRow) {
                      return;
                    }

                    setSelectedRow(null);
                    onEditReading(selectedRow);
                  }}
                  disabled={!canEditSelectedReading}
                  style={({ pressed }) => [
                    styles.readingSummaryEditButton,
                    !canEditSelectedReading && styles.readingSummaryEditButtonDisabled,
                    pressed && canEditSelectedReading ? styles.readingSummaryEditButtonPressed : null,
                  ]}
                >
                  <Ionicons name="create-outline" size={15} color={canEditSelectedReading ? palette.onAccent : palette.ink500} />
                  <Text style={[styles.readingSummaryEditText, !canEditSelectedReading && styles.readingSummaryEditTextDisabled]}>
                    {canEditSelectedReading ? `Edit ${formatEditCountdown(editRemainingMs)}` : 'Edit expired'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </Card>
  );
}

function ReadingHistorySkeleton() {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const responsiveMetrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, responsiveMetrics), [palette, isDark, responsiveMetrics]);

  return (
    <View style={styles.resultsStack}>
      <View style={styles.historyViewTabs}>
        <View style={[styles.historyViewTab, styles.historyViewTabActive, styles.skeletonTab]}>
          <View style={[styles.historySkeletonBlock, styles.historySkeletonIcon]} />
          <View style={[styles.historySkeletonBlock, styles.historySkeletonTabText]} />
        </View>
        <View style={[styles.historyViewTab, styles.skeletonTab]}>
          <View style={[styles.historySkeletonBlock, styles.historySkeletonIcon]} />
          <View style={[styles.historySkeletonBlock, styles.historySkeletonTabTextShort]} />
        </View>
      </View>

      <Card style={styles.shiftArrangeCard}>
        <View style={styles.shiftArrangeHeader}>
          <View style={[styles.historySkeletonBlock, styles.historySkeletonSmallIcon]} />
          <View style={[styles.historySkeletonBlock, styles.historySkeletonHeading]} />
        </View>
        <View style={styles.shiftArrangeChips}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={[styles.historySkeletonBlock, styles.historySkeletonChip]} />
          ))}
        </View>
      </Card>

      <View style={styles.tableSectionLabelRow}>
        <View style={[styles.historySkeletonBlock, styles.historySkeletonSmallIcon]} />
        <View style={[styles.historySkeletonBlock, styles.historySkeletonSectionLabel]} />
      </View>

      <Card style={styles.tableCard}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={[styles.tableCell, item === 0 && styles.tableFirstCell]}>
              <View style={[styles.historySkeletonBlock, styles.historySkeletonHeaderCell]} />
            </View>
          ))}
        </View>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={[styles.tableRow, row % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}>
            {[0, 1, 2].map((cell) => (
              <View key={`${row}:${cell}`} style={[styles.tableCell, cell === 0 && styles.tableFirstCell]}>
                <View style={[styles.historySkeletonBlock, cell === 0 ? styles.historySkeletonCellWide : styles.historySkeletonCell]} />
              </View>
            ))}
          </View>
        ))}
      </Card>
    </View>
  );
}

function TableModeChip({ label, active, onPress, iconName }) {
  const { width } = useWindowDimensions();
  const responsiveMetrics = useMemo(() => getResponsiveMetrics(width), [width]);

  return (
    <SegmentChip
      label={label}
      iconName={iconName}
      active={active}
      onPress={onPress}
      size={responsiveMetrics.isTablet ? 'field' : 'compact'}
      style={responsiveMetrics.isTablet ? { borderRadius: 14 } : null}
    />
  );
}

export default function ReadingHistoryScreen({ navigation, site, source }) {
  const { profile } = useAuth();
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const responsiveMetrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, responsiveMetrics), [palette, isDark, responsiveMetrics]);
  const isOfficeView = source === 'office-dashboard';
  const isCompactFilters = width < 430;
  const useTabletFilterRow = isOfficeView && responsiveMetrics.isTablet;
  const useMobileFilterPanel = !responsiveMetrics.isTablet;
  const [tableMode, setTableMode] = useState(site?.type || 'CHLORINATION');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [limit, setLimit] = useState(String(DEFAULT_HISTORY_LIMIT));
  const [items, setItems] = useState([]);
  const [dailyAverageRows, setDailyAverageRows] = useState([]);
  const [activeHistoryView, setActiveHistoryView] = useState('records');
  const [historyShiftFilter, setHistoryShiftFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [operatorSummaryDismissed, setOperatorSummaryDismissed] = useState(false);
  const isOperatorAllSitesView = !isOfficeView && !site?.id;
  const [operatorSiteView, setOperatorSiteView] = useState('all');
  const resolvedTableMode = isOfficeView
    ? tableMode
    : site?.type || (operatorSiteView === 'all' ? '' : operatorSiteView);

  const chlorinationColumns = [
    { key: 'date', label: 'Date', width: 110, render: (row) => formatShortDateTime(row.slot_datetime).slice(0, 10) },
    { key: 'shift', label: 'Shift', width: 90, render: (row) => getShiftLabel(row.slot_datetime) },
    { key: 'time', label: 'Time', width: 90, render: (row) => formatTimeSlot(row.slot_datetime) },
    { key: 'pressure', label: 'Pressure', width: 90, render: (row) => row.pressure_psi },
    { key: 'rc', label: 'RC', width: 80, render: (row) => row.rc_ppm },
    { key: 'turbidity', label: 'Turbidity', width: 95, render: (row) => row.turbidity_ntu },
    { key: 'ph', label: 'pH', width: 70, render: (row) => row.ph },
    { key: 'tds', label: 'TDS', width: 80, render: (row) => row.tds_ppm },
    { key: 'tank', label: 'Tank Level', width: 105, render: (row) => row.tank_level_liters },
    { key: 'flowrate', label: 'Flowrate', width: 95, render: (row) => row.flowrate_m3hr },
    { key: 'totalizer', label: 'Totalizer', width: 95, render: (row) => row.totalizer },
    { key: 'powerConsumption', label: 'Power kWh', width: 105, render: (row) => row.chlorination_power_kwh },
    { key: 'chlorine', label: 'Chlorine Used', width: 115, render: (row) => row.chlorine_consumed },
    { key: 'peroxide', label: 'Peroxide Consumption', width: 155, render: (row) => row.peroxide_consumption },
    { key: 'recordedAt', label: 'Recorded At', width: 135, render: (row) => formatShortDateTime(row.reading_datetime) },
    { key: 'recordedBy', label: 'Recorded By', width: 140, render: (row) => row.submitted_profile?.full_name || row.submitted_profile?.email || '-' },
    { key: 'remarks', label: 'Remarks', width: 160, render: (row) => row.remarks || row.status || '-' },
  ];

  const deepwellColumns = [
    { key: 'date', label: 'Date', width: 110, render: (row) => formatShortDateTime(row.slot_datetime).slice(0, 10) },
    { key: 'shift', label: 'Shift', width: 90, render: (row) => getShiftLabel(row.slot_datetime) },
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
    { key: 'shift', label: 'Shift', width: 90, render: (row) => getShiftLabel(row.slot_datetime) },
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
    { key: 'totalizer', field: 'totalizer', label: 'TOTALIZER', width: 120, aggregate: 'previousDayDifference' },
    { key: 'powerConsumption', field: 'chlorination_power_kwh', label: 'POWER CONSUMPTION (KWH)', width: 190, aggregate: 'previousDayDifference' },
    { key: 'chlorine', field: 'chlorine_consumed', label: 'AVG CHLORINE USED (KG)', width: 165 },
    { key: 'peroxide', field: 'peroxide_consumption', label: 'AVG PEROXIDE CONSUMPTION', width: 190 },
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
    { key: 'power', field: 'power_kwh_shift', label: 'POWER CONSUMPTION (KWH)', width: 190, aggregate: 'previousDayDifference' },
  ];

  const dailyAverageColumns =
    resolvedTableMode === 'CHLORINATION'
      ? [
          { key: 'date', label: 'DATE', width: 120, render: (row) => row.date },
          ...chlorinationAverageFields.map((field) => ({
            key: field.key,
            label: field.label,
            width: field.width,
            render: (row) => formatAverageValue(row[field.key]),
          })),
        ]
      : resolvedTableMode === 'DEEPWELL'
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
    resolvedTableMode === 'CHLORINATION'
      ? chlorinationColumns
      : resolvedTableMode === 'DEEPWELL'
        ? deepwellColumns
        : genericColumns;
  const canShowDailyAverageView = supportsDailyAverageMode(resolvedTableMode);
  const arrangedItems = useMemo(() => arrangeRowsByShift(items, historyShiftFilter), [items, historyShiftFilter]);

  async function loadHistory(nextFilters) {
    setLoading(true);
    setMessage('');
    setMessageTone('info');

    const effectiveOperatorSiteView = nextFilters?.operatorSiteView ?? operatorSiteView;
    const effectiveOperatorSiteType =
      !isOfficeView && !site?.id && effectiveOperatorSiteView !== 'all'
        ? effectiveOperatorSiteView
        : undefined;
    const effectiveTableMode = isOfficeView
      ? nextFilters?.tableMode ?? tableMode
      : site?.type || effectiveOperatorSiteType || tableMode;
    const effectiveHistoryView = nextFilters?.historyView ?? activeHistoryView;
    const effectiveFromDate = nextFilters?.fromDate ?? fromDate;
    const effectiveToDate = nextFilters?.toDate ?? toDate;
    const effectiveLimit = nextFilters?.limit ?? limit;
    const safeLimit = Math.min(MAX_HISTORY_LIMIT, Math.max(1, Number(effectiveLimit) || DEFAULT_HISTORY_LIMIT));
    const averageSourceLimit = Math.min(MAX_AVERAGE_SOURCE_LIMIT, Math.max(safeLimit, DEFAULT_HISTORY_LIMIT));
    const canLoadDailyAverages = supportsDailyAverageMode(effectiveTableMode);
    const shouldLoadDailyAverages = canLoadDailyAverages && effectiveHistoryView === 'average';
    const shouldLoadRecords = effectiveHistoryView === 'records' || !canLoadDailyAverages;

    if (effectiveFromDate && effectiveToDate && effectiveFromDate > effectiveToDate) {
      setItems([]);
      setLoading(false);
      setMessageTone('error');
      setMessage('The "from" date must be on or before the "to" date.');
      return;
    }

    try {
      const shouldUseSiteDefaultRange = !isOfficeView && !effectiveFromDate.trim() && !effectiveToDate.trim();
      const siteDefaultRange = shouldUseSiteDefaultRange ? previousAndCurrentDayDateValues() : null;
      const filters = {
        siteId: site?.id || undefined,
        siteType: isOfficeView ? effectiveTableMode : effectiveOperatorSiteType,
        fromDate: effectiveFromDate.trim() || undefined,
        toDate: effectiveToDate.trim() || undefined,
      };
      const recordsFilters = {
        ...filters,
        fromDate: siteDefaultRange?.fromDate || filters.fromDate,
        toDate: siteDefaultRange?.toDate || filters.toDate,
      };
      const averagingFilters = {
        ...filters,
        fromDate:
          effectiveTableMode === 'CHLORINATION' && filters.fromDate
            ? shiftDateValue(filters.fromDate, -1)
            : filters.fromDate,
      };

      const [nextItems, averagingItems] = await Promise.all([
        shouldLoadRecords
          ? listReadings({
              ...recordsFilters,
              limit: safeLimit,
            })
          : Promise.resolve([]),
        shouldLoadDailyAverages
          ? listReadings({
              ...averagingFilters,
              limit: averageSourceLimit,
            })
          : Promise.resolve([]),
      ]);

      const averageRows = (
        shouldLoadDailyAverages && effectiveTableMode === 'CHLORINATION'
          ? aggregateDailyRows(averagingItems, chlorinationAverageFields, {
              visibleFromDate: filters.fromDate,
              visibleToDate: filters.toDate,
            })
          : shouldLoadDailyAverages && effectiveTableMode === 'DEEPWELL'
            ? aggregateDailyRows(averagingItems, deepwellAverageFields)
            : []
      ).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      setItems(nextItems);
      setDailyAverageRows(averageRows);
      setMessageTone('success');
      setLastUpdatedAt(new Date());
      setMessage(
        isOfficeView && effectiveHistoryView === 'average'
          ? `Showing ${averageRows.length} ${effectiveTableMode.toLowerCase()} Daily Average row(s).`
          : isOfficeView
            ? `Showing ${nextItems.length} ${effectiveTableMode.toLowerCase()} record(s).`
          : shouldUseSiteDefaultRange
            ? `Showing ${nextItems.length} record(s) from previous day and current day for ${isOperatorAllSitesView ? 'all sites' : 'this site'}.`
            : effectiveHistoryView === 'average'
              ? `Showing ${averageRows.length} daily average row(s) for ${isOperatorAllSitesView ? 'all sites' : 'this site'}.`
              : `Showing latest ${nextItems.length} record(s) for ${isOperatorAllSitesView ? 'all sites' : 'this site'}.`
      );
    } catch (error) {
      setItems([]);
      setDailyAverageRows([]);
      setMessageTone('error');
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

  async function handleClearFilters() {
    setFromDate('');
    setToDate('');
    setLimit(String(DEFAULT_HISTORY_LIMIT));
    setHistoryShiftFilter('all');
    if (isOperatorAllSitesView) {
      setOperatorSiteView('all');
      setActiveHistoryView('records');
    }
    await loadHistory({
      tableMode,
      operatorSiteView: isOperatorAllSitesView ? 'all' : operatorSiteView,
      historyView: isOperatorAllSitesView ? 'records' : activeHistoryView,
      fromDate: '',
      toDate: '',
      limit: String(DEFAULT_HISTORY_LIMIT),
    });
  }

  async function handleExportFile() {
    if (!isOfficeView) {
      setMessageTone('error');
      setMessage('Export is available only from the office dashboard.');
      return;
    }

    if (!arrangedItems.length && !dailyAverageRows.length) {
      setMessageTone('info');
      setMessage(`Load some reading history first before exporting to ${exportFormat.toUpperCase()}.`);
      return;
    }

    setExporting(true);

    try {
      let exportResult = null;
      const includeAverages = (tableMode === 'CHLORINATION' || tableMode === 'DEEPWELL') && dailyAverageRows.length;

      if (exportFormat === 'xlsx') {
        const workbook = XLSX.utils.book_new();

        if (includeAverages) {
          const averageSheet = XLSX.utils.aoa_to_sheet(buildTableRows(dailyAverageColumns, dailyAverageRows));
          XLSX.utils.book_append_sheet(workbook, averageSheet, 'Daily Averages');
        }

        if (arrangedItems.length) {
          appendLogsheetSheets(workbook, arrangedItems, resolvedTableMode);
        }

        const fileName = buildExportFileName(tableMode, site?.name, 'xlsx');

        if (Platform.OS === 'web') {
          const workbookArray = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob(
            [workbookArray],
            { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
          );
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', fileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } else {
          exportResult = await saveNativeExportFile({
            fileName,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Export reading history Excel file',
            uti: 'org.openxmlformats.spreadsheetml.sheet',
            base64Content: XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }),
            shareMessage: 'Reading history Excel export is ready.',
          });
        }
      } else if (exportFormat === 'pdf') {
        const fileName = buildExportFileName(tableMode, site?.name, 'pdf');
        const html = buildPdfDocument({
          tableMode,
          siteName: site?.name,
          includeAverages,
          dailyAverageColumns,
          dailyAverageRows,
          activeColumns,
          items: arrangedItems,
        });

        if (Platform.OS === 'web') {
          const printWindow = window.open('', '_blank');

          if (!printWindow) {
            throw new Error('Unable to open a print window for PDF export.');
          }

          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        } else {
          const { uri: fileUri } = await Print.printToFileAsync({
            html,
            base64: false,
          });

          exportResult = await saveNativeExportFile({
            fileName,
            mimeType: 'application/pdf',
            dialogTitle: 'Export reading history PDF',
            uti: 'com.adobe.pdf',
            localUri: fileUri,
            shareMessage: 'Reading history PDF export is ready.',
          });
        }
      } else {
        const sections = [];

        if (includeAverages) {
          sections.push(buildCsvSection('Daily Average Values', dailyAverageColumns, dailyAverageRows));
        }

        if (arrangedItems.length) {
          sections.push(buildCsvSection('Detailed Reading History', activeColumns, arrangedItems));
        }

        const csvContent = `\uFEFF${sections.join('\n\n')}`;
        const fileName = buildExportFileName(tableMode, site?.name, 'csv');

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
          exportResult = await saveNativeExportFile({
            fileName,
            mimeType: 'text/csv',
            dialogTitle: 'Export reading history CSV',
            uti: 'public.comma-separated-values-text',
            textContent: csvContent,
            shareMessage: 'Reading history CSV export is ready.',
          });
        }
      }

      setMessageTone('success');
      setMessage(buildNativeExportSuccessMessage(exportFormat, exportResult));
    } catch (error) {
      setMessageTone('error');
      setMessage(error.message || `Failed to export ${exportFormat.toUpperCase()}.`);
    } finally {
      setExporting(false);
    }
  }

  function handleEditReading(reading) {
    navigation.navigate('submit-reading', {
      site: getReadingSite(reading),
      editingReading: reading,
      editReturnParams: {
        site: site || getReadingSite(reading),
        siteScope: site ? undefined : 'all',
        source,
      },
    });
  }

  const headerStatusChips = [
    {
      key: 'connected',
      label: messageTone === 'error' ? 'Connection issue' : 'Connected',
      tone: messageTone === 'error' ? 'warning' : 'success',
      iconName: messageTone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline',
      iconColor: messageTone === 'error' ? palette.amber500 : palette.successText,
    },
    {
      key: 'alerts',
      label: '0 alerts',
      tone: 'neutral',
      iconName: 'notifications-outline',
      iconColor: palette.ink500,
    },
    {
      key: 'updated',
      label: `Updated ${formatHeaderUpdatedTime(lastUpdatedAt)}`,
      tone: 'neutral',
      iconName: 'ellipse',
      iconColor: palette.teal500,
    },
  ];

  return (
    <ScreenShell
      eyebrow="Live Supabase Workspace"
      title="Reading History"
      showMenuButton
      stickyHeader
      statusChips={headerStatusChips}
      refreshing={loading}
      onRefresh={() => loadHistory()}
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
      ) : (
        <View style={styles.topBackRow}>
          <Pressable onPress={navigation.goBack} style={styles.topBackButton}>
            <Ionicons name="arrow-back" size={14} color={palette.ink900} />
            <Text style={styles.topBackButtonText}>Back to Site selection</Text>
          </Pressable>
        </View>
      )}

      {!isOfficeView && !operatorSummaryDismissed ? (
        <Card style={styles.operatorSummaryCard}>
          <Pressable onPress={() => setOperatorSummaryDismissed(true)} style={styles.operatorSummaryDismiss}>
            <Ionicons name="close" size={14} color={palette.ink700} />
          </Pressable>
          <View style={styles.operatorSummaryHeader}>
            <View style={styles.operatorSummaryIcon}>
              <Ionicons name="time-outline" size={16} color={palette.ink900} />
            </View>
            <View style={styles.operatorSummaryCopy}>
              <Text style={styles.operatorSummaryTitle}>Operator history view</Text>
              <Text style={styles.operatorSummaryBody}>
                Review all submitted readings for {isOperatorAllSitesView ? 'all sites' : site?.name || 'your selected site'}, including entries from other operators.
              </Text>
            </View>
          </View>
          <View style={styles.operatorMetaRow}>
            <View style={styles.operatorMetaPill}>
              <Text style={styles.operatorMetaLabel}>Site</Text>
              <Text style={styles.operatorMetaValue}>{isOperatorAllSitesView ? 'All sites' : site?.name || '-'}</Text>
            </View>
            <View style={styles.operatorMetaPill}>
              <Text style={styles.operatorMetaLabel}>Type</Text>
              <Text style={styles.operatorMetaValue}>{isOperatorAllSitesView ? 'Chlorination + Deepwell' : site?.type || resolvedTableMode}</Text>
            </View>
            <View style={styles.operatorMetaPill}>
              <Text style={styles.operatorMetaLabel}>Scope</Text>
              <Text style={styles.operatorMetaValue}>All operators</Text>
            </View>
          </View>
        </Card>
      ) : !operatorSummaryDismissed ? (
        null
      ) : null}

      <Card style={[styles.filterCard, useMobileFilterPanel && styles.filterCardMobile]}>
        <View style={styles.filterTitleRow}>
          <View style={styles.filterTitleMain}>
            <View style={styles.filterTitleIcon}>
              <Ionicons name="funnel-outline" size={15} color={palette.ink900} />
            </View>
            <Text style={styles.filterTitle}>{isOfficeView ? 'Office filters' : 'History filters'}</Text>
          </View>
          {isOfficeView ? (
            <Pressable onPress={handleClearFilters} style={styles.filterClearButton}>
              <Ionicons name="refresh-outline" size={15} color={palette.ink900} />
            </Pressable>
          ) : null}
        </View>
        <View style={useTabletFilterRow ? styles.tabletFilterRow : null}>
          {isOfficeView ? (
            <View style={[styles.filterField, useTabletFilterRow && styles.tabletTableViewField, useMobileFilterPanel && styles.filterSection]}>
              {useMobileFilterPanel ? <Text style={styles.filterSectionTitle}>Table</Text> : null}
              <Text style={styles.filterLabel}>Table view</Text>
              <View style={styles.modeRow}>
                <TableModeChip
                  label="Chlorination"
                  iconName="water-outline"
                  active={tableMode === 'CHLORINATION'}
                  onPress={async () => {
                    setTableMode('CHLORINATION');
                    setActiveHistoryView('records');
                    await loadHistory({ tableMode: 'CHLORINATION' });
                  }}
                />
                <TableModeChip
                  label="Deepwell"
                  iconName="flash-outline"
                  active={tableMode === 'DEEPWELL'}
                  onPress={async () => {
                    setTableMode('DEEPWELL');
                    setActiveHistoryView('records');
                    await loadHistory({ tableMode: 'DEEPWELL' });
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={[styles.filterField, useMobileFilterPanel && styles.filterSection]}>
              {useMobileFilterPanel ? <Text style={styles.filterSectionTitle}>Table</Text> : null}
              <Text style={styles.filterLabel}>Site view</Text>
              {isOperatorAllSitesView ? (
                <View style={styles.modeRow}>
                  <TableModeChip
                    label="All sites"
                    iconName="layers-outline"
                    active={operatorSiteView === 'all'}
                    onPress={async () => {
                      setOperatorSiteView('all');
                      setActiveHistoryView('records');
                      await loadHistory({ operatorSiteView: 'all', historyView: 'records' });
                    }}
                  />
                  <TableModeChip
                    label="Chlorination"
                    iconName="water-outline"
                    active={operatorSiteView === 'CHLORINATION'}
                    onPress={async () => {
                      setOperatorSiteView('CHLORINATION');
                      setActiveHistoryView('records');
                      await loadHistory({ operatorSiteView: 'CHLORINATION', historyView: 'records' });
                    }}
                  />
                  <TableModeChip
                    label="Deepwell"
                    iconName="flash-outline"
                    active={operatorSiteView === 'DEEPWELL'}
                    onPress={async () => {
                      setOperatorSiteView('DEEPWELL');
                      setActiveHistoryView('records');
                      await loadHistory({ operatorSiteView: 'DEEPWELL', historyView: 'records' });
                    }}
                  />
                </View>
              ) : (
                <View style={styles.operatorTypePill}>
                  <Ionicons
                    name={resolvedTableMode === 'CHLORINATION' ? 'water-outline' : 'flash-outline'}
                    size={14}
                    color={palette.onAccent}
                  />
                  <Text style={styles.operatorTypePillText}>{resolvedTableMode || 'Selected site'}</Text>
                </View>
              )}
            </View>
          )}

          {Platform.OS === 'web' ? (
            <View style={[
              styles.dateRangeRow,
              useTabletFilterRow && styles.tabletDateRangeRow,
              isCompactFilters && styles.dateRangeRowCompact,
              useMobileFilterPanel && styles.filterSection,
              useMobileFilterPanel && styles.mobileDateRangeSection,
            ]}>
            {useMobileFilterPanel ? <Text style={styles.filterSectionTitle}>Date range</Text> : null}
            <View style={[styles.filterField, styles.dateRangeField, isCompactFilters && styles.dateRangeFieldCompact, useMobileFilterPanel && styles.mobileDateRangeField]}>
              <Text style={styles.filterLabel}>From date</Text>
              <View style={[styles.inputShell, isCompactFilters && styles.compactInputShell]}>
                <View style={styles.inputIconWrap}>
                  <Ionicons name="calendar-outline" size={15} color={palette.ink500} />
                </View>
                <ScrollAwareTextInput
                  value={fromDate}
                  onChangeText={setFromDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={palette.ink500}
                  style={[styles.filterInput, isCompactFilters && styles.compactFilterInput]}
                />
              </View>
            </View>

            <View style={[styles.filterField, styles.dateRangeField, isCompactFilters && styles.dateRangeFieldCompact, useMobileFilterPanel && styles.mobileDateRangeField]}>
              <Text style={styles.filterLabel}>To date</Text>
              <View style={[styles.inputShell, isCompactFilters && styles.compactInputShell]}>
                <View style={styles.inputIconWrap}>
                  <Ionicons name="calendar-clear-outline" size={15} color={palette.ink500} />
                </View>
                <ScrollAwareTextInput
                  value={toDate}
                  onChangeText={setToDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={palette.ink500}
                  style={[styles.filterInput, isCompactFilters && styles.compactFilterInput]}
                />
              </View>
            </View>

            <View style={[styles.filterField, styles.limitInlineField, isCompactFilters && styles.limitInlineFieldCompact, useMobileFilterPanel && styles.mobileDateRangeField]}>
              <Text style={styles.filterLabel}>Limit</Text>
              <View style={[styles.inputShell, isCompactFilters && styles.compactInputShell]}>
                <View style={styles.inputIconWrap}>
                  <Ionicons name="list-outline" size={15} color={palette.ink500} />
                </View>
                <ScrollAwareTextInput
                  value={limit}
                  onChangeText={setLimit}
                  keyboardType="number-pad"
                  placeholder="50"
                  placeholderTextColor={palette.ink500}
                  style={[styles.filterInput, isCompactFilters && styles.compactFilterInput]}
                />
              </View>
            </View>
            </View>
          ) : (
            <View style={[
              styles.dateRangeRow,
              useTabletFilterRow && styles.tabletDateRangeRow,
              isCompactFilters && styles.dateRangeRowCompact,
              useMobileFilterPanel && styles.filterSection,
              useMobileFilterPanel && styles.mobileDateRangeSection,
            ]}>
            {useMobileFilterPanel ? <Text style={styles.filterSectionTitle}>Date range</Text> : null}
            <View style={[styles.dateRangeField, isCompactFilters && styles.dateRangeFieldCompact, useMobileFilterPanel && styles.mobileDateRangeField]}>
              <MobileDateField
                label="From date"
                value={fromDate}
                placeholder="Start date"
                onPress={() => setPickerTarget('from')}
              />
            </View>
            <View style={[styles.dateRangeField, isCompactFilters && styles.dateRangeFieldCompact, useMobileFilterPanel && styles.mobileDateRangeField]}>
              <MobileDateField
                label="To date"
                value={toDate}
                placeholder="End date"
                onPress={() => setPickerTarget('to')}
              />
            </View>
            <View style={[styles.filterField, styles.limitInlineField, isCompactFilters && styles.limitInlineFieldCompact, useMobileFilterPanel && styles.mobileDateRangeField]}>
              <Text style={styles.filterLabel}>Limit</Text>
              <View style={[styles.inputShell, isCompactFilters && styles.compactInputShell]}>
                <View style={styles.inputIconWrap}>
                  <Ionicons name="list-outline" size={15} color={palette.ink500} />
                </View>
                <ScrollAwareTextInput
                  value={limit}
                  onChangeText={setLimit}
                  keyboardType="number-pad"
                  placeholder="50"
                  placeholderTextColor={palette.ink500}
                  style={[styles.filterInput, isCompactFilters && styles.compactFilterInput]}
                />
              </View>
            </View>
            </View>
          )}
        </View>

        <View style={[styles.filterActions, useMobileFilterPanel && styles.filterActionsSection]}>
          {useMobileFilterPanel ? <Text style={styles.filterSectionTitle}>Actions</Text> : null}
          {!isOfficeView ? (
            <View style={styles.actionItem}>
              <PrimaryButton
                label="Clear"
                onPress={handleClearFilters}
                tone="secondary"
                labelStyle={styles.compactActionLabel}
                icon={<Ionicons name="refresh-outline" size={16} color={palette.ink900} />}
              />
            </View>
          ) : null}
          <View style={styles.actionItem}>
            <PrimaryButton
              label="Load"
              onPress={loadHistory}
              loading={loading}
              labelStyle={styles.compactActionLabel}
              icon={<Ionicons name="download-outline" size={16} color={palette.onAccent} />}
            />
          </View>
          {isOfficeView ? (
            <View style={[styles.actionItem, styles.exportActionItem]}>
              <SplitExportButton
                format={exportFormat}
                loading={exporting}
                onExport={handleExportFile}
                onSelectFormat={setExportFormat}
                size="action"
              />
            </View>
          ) : null}
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

      {message ? <MessageBanner tone={messageTone}>{message}</MessageBanner> : null}

      {loading ? (
        isOfficeView ? <LoadingState label="Loading reading history" /> : <ReadingHistorySkeleton />
      ) : (
        <View style={styles.resultsStack}>
          <View style={styles.historyViewTabs}>
            {canShowDailyAverageView ? (
              <Pressable
                onPress={async () => {
                  setActiveHistoryView('average');
                  await loadHistory({ historyView: 'average' });
                }}
                style={[
                  styles.historyViewTab,
                  activeHistoryView === 'average' && styles.historyViewTabActive,
                ]}
              >
                <Ionicons
                  name="calculator-outline"
                  size={13}
                  color={activeHistoryView === 'average' ? palette.onAccent : palette.ink700}
                />
                <Text style={[styles.historyViewTabText, activeHistoryView === 'average' && styles.historyViewTabTextActive]}>
                  Daily Average Records
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={async () => {
                setActiveHistoryView('records');
                await loadHistory({ historyView: 'records' });
              }}
              style={[
                styles.historyViewTab,
                activeHistoryView === 'records' && styles.historyViewTabActive,
              ]}
            >
              <Ionicons
                name="reader-outline"
                size={13}
                color={activeHistoryView === 'records' ? palette.onAccent : palette.ink700}
              />
              <Text style={[styles.historyViewTabText, activeHistoryView === 'records' && styles.historyViewTabTextActive]}>
                Daily Records
              </Text>
            </Pressable>
          </View>

          {canShowDailyAverageView && activeHistoryView === 'average' ? (
            <>
              <Card style={styles.averageIntroCard}>
                <View style={styles.averageIntroHeader}>
                  <View style={styles.averageIntroIcon}>
                    <Ionicons name="calculator-outline" size={15} color={palette.ink900} />
                  </View>
                  <Text style={styles.averageIntroTitle}>Daily average values</Text>
                </View>
                <Text style={styles.averageIntroBody}>
                  Averages are calculated per day from the loaded records to keep history fast with large datasets. Increase the limit or narrow the date range for a wider sample.
                </Text>
              </Card>

              <View style={styles.tableSectionLabelRow}>
                <Ionicons name="calculator-outline" size={13} color={palette.ink500} />
                <Text style={styles.tableSectionLabel}>Daily average table</Text>
              </View>
              <DataTable
                columns={dailyAverageColumns}
                rows={dailyAverageRows}
                emptyMessage={`No daily averages can be calculated yet for ${resolvedTableMode.toLowerCase()}.`}
              />
            </>
          ) : null}

          {activeHistoryView === 'records' || !canShowDailyAverageView ? (
            <>
              <View style={styles.shiftArrangeCard}>
                <View style={styles.shiftArrangeHeader}>
                  <Ionicons name="swap-vertical-outline" size={13} color={palette.ink500} />
                  <Text style={styles.shiftArrangeTitle}>Arrange by shift</Text>
                </View>
                <View style={styles.shiftArrangeChips}>
                  {SHIFT_OPTIONS.map((option) => {
                    const active = historyShiftFilter === option.key;

                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => setHistoryShiftFilter(option.key)}
                        style={[styles.shiftArrangeChip, active && styles.shiftArrangeChipActive]}
                      >
                        <Text style={[styles.shiftArrangeChipText, active && styles.shiftArrangeChipTextActive]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.tableSectionLabelRow}>
                <Ionicons name="reader-outline" size={13} color={palette.ink500} />
                <Text style={styles.tableSectionLabel}>
                  {isOfficeView ? 'Detailed reading history table' : 'Site reading records table'}
                </Text>
              </View>
              <DataTable
                columns={activeColumns}
                rows={arrangedItems}
                emptyMessage={
                  isOfficeView
                    ? `Try another date range or confirm ${resolvedTableMode.toLowerCase()} readings have already been submitted to the database.`
                    : 'No records were found for this site in the selected date range.'
                }
                onEditReading={handleEditReading}
              />
            </>
          ) : null}
        </View>
      )}
    </ScreenShell>
  );
}

function createStyles(palette, isDark, responsiveMetrics = getResponsiveMetrics()) {
  return StyleSheet.create(scaleStyleDefinitions({
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
      position: 'relative',
      zIndex: 20,
      elevation: 8,
    },
    filterCardMobile: {
      gap: 8,
    },
    filterSection: {
      width: '100%',
      flexDirection: 'column',
      gap: 8,
      borderWidth: 1,
      borderColor: isDark ? '#203246' : '#D8E4F0',
      backgroundColor: isDark ? '#0C1621' : '#F9FCFF',
      borderRadius: 12,
      padding: 10,
    },
    filterActionsSection: {
      borderWidth: 1,
      borderColor: isDark ? '#203246' : '#D8E4F0',
      backgroundColor: isDark ? '#0C1621' : '#F9FCFF',
      borderRadius: 12,
      padding: 10,
    },
    filterSectionTitle: {
      width: '100%',
      color: palette.ink500,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    operatorSummaryCard: {
      gap: 8,
      backgroundColor: isDark ? '#112B24' : '#ECFCF8',
      borderColor: isDark ? '#1A655E' : '#A7E8DD',
      paddingVertical: 12,
      paddingHorizontal: 14,
      position: 'relative',
      paddingRight: 40,
    },
    operatorSummaryDismiss: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 22,
      height: 22,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#123A37' : '#DDF7F3',
      borderWidth: 1,
      borderColor: isDark ? '#1FAF9E' : '#9EDFD6',
      zIndex: 1,
    },
    operatorSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    operatorSummaryIcon: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#123A37' : '#DDF7F3',
      borderWidth: 1,
      borderColor: isDark ? '#1FAF9E' : '#9EDFD6',
    },
    operatorSummaryCopy: {
      flex: 1,
      gap: 1,
    },
    operatorSummaryTitle: {
      color: palette.ink900,
      fontSize: 14,
      fontWeight: '800',
    },
    operatorSummaryBody: {
      color: palette.ink700,
      fontSize: 11,
      lineHeight: 16,
    },
    operatorMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    operatorMetaPill: {
      minWidth: 88,
      flexGrow: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? '#1A655E' : '#A7E8DD',
      backgroundColor: isDark ? '#102824' : '#F7FFFD',
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    operatorMetaLabel: {
      color: palette.ink500,
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    operatorMetaValue: {
      marginTop: 3,
      color: palette.ink900,
      fontSize: 12,
      fontWeight: '800',
    },
    filterTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    filterTitleMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
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
    filterClearButton: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#1A655E' : '#B4E5DE',
      backgroundColor: isDark ? '#11312D' : '#E5F5F3',
    },
    filterField: {
      gap: 6,
    },
    tabletFilterRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    tabletTableViewField: {
      flexGrow: 0,
      flexShrink: 1,
      minWidth: 214,
      maxWidth: 260,
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
    tabletDateRangeRow: {
      flex: 1,
      minWidth: 0,
      alignItems: 'flex-end',
      gap: 6,
    },
    dateRangeRowCompact: {
      flexWrap: 'wrap',
    },
    mobileDateRangeSection: {
      flexDirection: 'column',
      alignItems: 'stretch',
      overflow: 'hidden',
    },
    dateRangeField: {
      flex: 1,
      minWidth: 0,
    },
    dateRangeFieldCompact: {
      minWidth: 0,
      flexBasis: '48%',
    },
    mobileDateRangeField: {
      width: '100%',
      flex: 0,
      flexBasis: 'auto',
      maxWidth: '100%',
    },
    filterInput: {
      minHeight: 44,
      flex: 1,
      paddingVertical: 10,
      color: palette.ink900,
      fontSize: 13,
    },
    compactFilterInput: {
      minHeight: 38,
      paddingVertical: 8,
      fontSize: 11,
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
    compactInputShell: {
      minHeight: 38,
      gap: 5,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    inputRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inputIconWrap: {
      width: 16,
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
      alignItems: 'center',
      gap: 6,
    },
    operatorTypePill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      backgroundColor: palette.navy700,
      borderWidth: 1,
      borderColor: palette.cyan300,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    operatorTypePillText: {
      color: palette.onAccent,
      fontSize: 11,
      fontWeight: '700',
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
    compactDateField: {
      minHeight: 38,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: 12,
    },
    dateFieldValue: {
      flex: 1,
      flexShrink: 1,
      color: palette.ink900,
      fontSize: 13,
    },
    compactDateFieldValue: {
      fontSize: 11,
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
    exportActionItem: {
      flex: 1.05,
      zIndex: 30,
    },
    compactActionLabel: {
      fontSize: 11,
      lineHeight: 13,
    },
    historyViewTabs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#0C1621' : '#F9FCFF',
      padding: 4,
      borderRadius: 8,
    },
    historyViewTab: {
      minHeight: 32,
      flex: 1,
      minWidth: 120,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 6,
    },
    historyViewTabActive: {
      backgroundColor: palette.navy700,
    },
    historyViewTabText: {
      color: palette.ink700,
      fontSize: 11,
      fontWeight: '800',
    },
    historyViewTabTextActive: {
      color: palette.onAccent,
    },
    shiftArrangeCard: {
      gap: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#0C1621' : '#F9FCFF',
      padding: 8,
    },
    shiftArrangeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    shiftArrangeTitle: {
      color: palette.ink700,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    shiftArrangeChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    shiftArrangeChip: {
      minHeight: 30,
      minWidth: 72,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#132131' : '#F3F8FD',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    shiftArrangeChipActive: {
      backgroundColor: palette.navy700,
      borderColor: palette.cyan300,
    },
    shiftArrangeChipText: {
      color: palette.ink700,
      fontSize: 10,
      fontWeight: '800',
    },
    shiftArrangeChipTextActive: {
      color: palette.onAccent,
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
    tableSectionLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
      marginBottom: -4,
    },
    tableSectionLabel: {
      color: palette.ink500,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tableCard: {
      padding: 0,
      overflow: 'hidden',
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
    tableRowPressed: {
      backgroundColor: isDark ? '#112131' : '#EAF4FB',
    },
    tableRowSelected: {
      backgroundColor: isDark ? '#163A53' : '#D9F0FA',
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
    tableCellTextSelected: {
      color: isDark ? palette.ink900 : palette.navy900,
      fontWeight: '700',
    },
    skeletonTab: {
      minHeight: 38,
    },
    historySkeletonBlock: {
      backgroundColor: isDark ? '#1B3145' : '#DDEAF6',
      borderRadius: 999,
    },
    historySkeletonIcon: {
      width: 14,
      height: 14,
    },
    historySkeletonSmallIcon: {
      width: 13,
      height: 13,
    },
    historySkeletonTabText: {
      width: 116,
      height: 12,
    },
    historySkeletonTabTextShort: {
      width: 78,
      height: 12,
    },
    historySkeletonHeading: {
      width: 108,
      height: 12,
    },
    historySkeletonChip: {
      width: 78,
      height: 28,
    },
    historySkeletonSectionLabel: {
      width: 174,
      height: 11,
    },
    historySkeletonHeaderCell: {
      width: '72%',
      height: 12,
      backgroundColor: isDark ? '#35506B' : '#8FB6D9',
    },
    historySkeletonCell: {
      width: '58%',
      height: 11,
    },
    historySkeletonCellWide: {
      width: '78%',
      height: 11,
    },
    readingSummaryOverlay: {
      flex: 1,
      justifyContent: 'center',
      padding: 18,
    },
    readingSummaryBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(3,10,17,0.78)' : 'rgba(17,35,59,0.44)',
    },
    readingSummarySheet: {
      maxHeight: '82%',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? '#27445E' : '#D8E6F5',
      backgroundColor: isDark ? '#07131F' : '#FFFFFF',
      padding: 14,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.28 : 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    readingSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    readingSummaryTitleWrap: {
      flex: 1,
      minWidth: 0,
    },
    readingSummaryEyebrow: {
      color: palette.teal600,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    readingSummaryTitle: {
      marginTop: 4,
      color: palette.ink900,
      fontSize: 18,
      fontWeight: '900',
    },
    readingSummaryMeta: {
      marginTop: 4,
      color: palette.ink500,
      fontSize: 11,
      fontWeight: '700',
    },
    readingSummaryClose: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#132536' : '#F4F8FC',
    },
    readingSummaryMetaGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    readingSummaryMetaTile: {
      flexGrow: 1,
      flexBasis: '48%',
      minWidth: 132,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#102131' : '#F7FBFF',
      padding: 9,
    },
    readingSummaryMetaLabel: {
      color: palette.ink500,
      fontSize: 9,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    readingSummaryMetaValue: {
      marginTop: 4,
      color: palette.ink900,
      fontSize: 11,
      fontWeight: '800',
    },
    readingSummaryScroll: {
      marginTop: 12,
    },
    readingSummaryList: {
      gap: 8,
      paddingBottom: 4,
    },
    readingSummaryRow: {
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
    readingSummaryLabel: {
      flex: 1,
      color: palette.ink700,
      fontSize: 11,
      fontWeight: '800',
    },
    readingSummaryValue: {
      flexShrink: 1,
      color: palette.ink900,
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'right',
    },
    readingSummaryRemarks: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#102131' : '#F7FBFF',
      padding: 10,
    },
    readingSummaryRemarksText: {
      marginTop: 5,
      color: palette.ink900,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '700',
    },
    readingSummaryActions: {
      marginTop: 12,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    readingSummaryEditButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 999,
      backgroundColor: palette.navy700,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minWidth: 112,
    },
    readingSummaryEditButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    readingSummaryEditButtonDisabled: {
      backgroundColor: isDark ? '#172536' : '#E8EEF5',
      borderWidth: 1,
      borderColor: palette.line,
    },
    readingSummaryEditText: {
      color: palette.onAccent,
      fontSize: 12,
      fontWeight: '900',
    },
    readingSummaryEditTextDisabled: {
      color: palette.ink500,
    },
  }, responsiveMetrics, {
    exclude: [
      'tableColumn.width',
      'averageTableColumn.width',
      'modalBackdrop.flex',
      'detailModal.maxHeight',
      'tableCell.flex',
      'readingSummaryOverlay.flex',
      'readingSummarySheet.maxHeight',
      'readingSummaryTitleWrap.flex',
      'readingSummaryMetaTile.flexBasis',
      'readingSummaryMetaTile.flexGrow',
      'readingSummaryLabel.flex',
    ],
  }));
}

function formatHeaderUpdatedTime(value) {
  if (!(value instanceof Date)) {
    return '--:--';
  }

  return value.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
