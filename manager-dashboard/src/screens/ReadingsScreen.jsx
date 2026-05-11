import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Eye, FileText, Filter, Grid2X2, List, RefreshCw, Search, Table2, X } from 'lucide-react';
import { listReadings } from '../services/readings';
import { aggregateDailyRows } from '../utils/production';

const CHLORINATION = 'CHLORINATION';
const DEEPWELL = 'DEEPWELL';

function formatShortDateTime(value) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeSlot(value) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAverageValue(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  return parsed.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shiftDateValue(value, amount) {
  if (!value) {
    return value;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  parsed.setDate(parsed.getDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function downloadBlob(content, fileName, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildTableRows(columns, rows) {
  return [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => column.render(row))),
  ];
}

function buildCsvSection(title, columns, rows) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    title,
    columns.map((column) => escape(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => escape(column.render(row))).join(',')),
  ].join('\n');
}

function sortRowsByDateDesc(rows) {
  return [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function getReadingSearchText(row) {
  return [
    row.sites?.name,
    row.status,
    row.remarks,
    row.submitted_profile?.full_name,
    row.submitted_profile?.email,
    row.slot_datetime,
    row.reading_datetime,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getReadingDetailFields(row) {
  if (!row) {
    return [];
  }

  const sharedFields = [
    ['Site', row.sites?.name || '-'],
    ['Status', row.status || '-'],
    ['Slot', formatShortDateTime(row.slot_datetime)],
    ['Recorded at', formatShortDateTime(row.reading_datetime)],
    ['Recorded by', row.submitted_profile?.full_name || row.submitted_profile?.email || '-'],
    ['Remarks', row.remarks || '-'],
  ];

  const typeFields =
    row.site_type === CHLORINATION
      ? [
          ['Pressure', row.pressure_psi ?? '-'],
          ['Residual chlorine', row.rc_ppm ?? '-'],
          ['Turbidity', row.turbidity_ntu ?? '-'],
          ['pH', row.ph ?? '-'],
          ['TDS', row.tds_ppm ?? '-'],
          ['Tank level', row.tank_level_liters ?? '-'],
          ['Flowrate', row.flowrate_m3hr ?? '-'],
          ['Totalizer', row.totalizer ?? '-'],
          ['Power kWh', row.chlorination_power_kwh ?? '-'],
          ['Chlorine used', row.chlorine_consumed ?? '-'],
          ['Peroxide', row.peroxide_consumption ?? '-'],
        ]
      : [
          ['Upstream pressure', row.upstream_pressure_psi ?? '-'],
          ['Downstream pressure', row.downstream_pressure_psi ?? '-'],
          ['Flowrate', row.flowrate_m3hr ?? '-'],
          ['Frequency', row.vfd_frequency_hz ?? '-'],
          ['Voltage L1', row.voltage_l1_v ?? '-'],
          ['Voltage L2', row.voltage_l2_v ?? '-'],
          ['Voltage L3', row.voltage_l3_v ?? '-'],
          ['Amperage', row.amperage_a ?? '-'],
          ['TDS', row.tds_ppm ?? '-'],
          ['Power kWh', row.power_kwh_shift ?? '-'],
        ];

  return [...sharedFields, ...typeFields];
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getExcelColumnName(index) {
  let value = index + 1;
  let name = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - remainder) / 26);
  }

  return name;
}

function buildWorksheetXml(rows) {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${getExcelColumnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join('');

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

async function buildXlsxBlob(sheets) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets
    .map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('')}
</Types>`
  );
  zip.folder('_rels').file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );
  zip.folder('xl').file(
    'workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets
    .map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('')}</sheets>
</workbook>`
  );
  zip.folder('xl').folder('_rels').file(
    'workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    )
    .join('')}
</Relationships>`
  );

  const worksheets = zip.folder('xl').folder('worksheets');
  sheets.forEach((sheet, index) => {
    worksheets.file(`sheet${index + 1}.xml`, buildWorksheetXml(sheet.rows));
  });

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function ExportMenu({ exporting, open, onToggle, onSelect }) {
  const options = [
    { key: 'csv', label: '.csv', icon: FileText },
    { key: 'xlsx', label: '.xlsx', icon: Grid2X2 },
    { key: 'pdf', label: '.pdf', icon: FileText },
  ];

  return (
    <div className="readings-export-menu">
      <button type="button" className="export-button" disabled={exporting} onClick={onToggle}>
        <FileText size={17} />
        {exporting ? 'Exporting...' : 'Export'}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open ? (
        <div className="export-format-list">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button type="button" key={option.key} onClick={() => onSelect(option.key)}>
                <Icon size={16} />
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function ReadingsScreen({ selectedTableMode = CHLORINATION }) {
  const [tableMode, setTableMode] = useState(selectedTableMode);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [limit, setLimit] = useState('50');
  const [siteFilter, setSiteFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState('25');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReading, setSelectedReading] = useState(null);
  const [items, setItems] = useState([]);
  const [dailyAverageRows, setDailyAverageRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [exportOpen, setExportOpen] = useState(false);
  const [visibleTable, setVisibleTable] = useState('records');
  const [message, setMessage] = useState('');

  const chlorinationColumns = useMemo(
    () => [
      { key: 'date', label: 'Date', render: (row) => formatShortDateTime(row.slot_datetime).slice(0, 10) },
      { key: 'time', label: 'Time', render: (row) => formatTimeSlot(row.slot_datetime) },
      { key: 'site', label: 'Site', render: (row) => row.sites?.name || '-' },
      { key: 'pressure', label: 'Pressure', render: (row) => row.pressure_psi ?? '-' },
      { key: 'rc', label: 'RC', render: (row) => row.rc_ppm ?? '-' },
      { key: 'turbidity', label: 'Turbidity', render: (row) => row.turbidity_ntu ?? '-' },
      { key: 'ph', label: 'pH', render: (row) => row.ph ?? '-' },
      { key: 'tds', label: 'TDS', render: (row) => row.tds_ppm ?? '-' },
      { key: 'tank', label: 'Tank Level', render: (row) => row.tank_level_liters ?? '-' },
      { key: 'flowrate', label: 'Flowrate', render: (row) => row.flowrate_m3hr ?? '-' },
      { key: 'totalizer', label: 'Totalizer', render: (row) => row.totalizer ?? '-' },
      { key: 'power', label: 'Power kWh', render: (row) => row.chlorination_power_kwh ?? '-' },
      { key: 'chlorine', label: 'Chlorine Used', render: (row) => row.chlorine_consumed ?? '-' },
      { key: 'peroxide', label: 'Peroxide', render: (row) => row.peroxide_consumption ?? '-' },
      { key: 'recordedAt', label: 'Recorded At', render: (row) => formatShortDateTime(row.reading_datetime) },
      { key: 'recordedBy', label: 'Recorded By', render: (row) => row.submitted_profile?.full_name || row.submitted_profile?.email || '-' },
      { key: 'remarks', label: 'Remarks', render: (row) => row.remarks || row.status || '-' },
    ],
    []
  );

  const deepwellColumns = useMemo(
    () => [
      { key: 'date', label: 'Date', render: (row) => formatShortDateTime(row.slot_datetime).slice(0, 10) },
      { key: 'time', label: 'Time', render: (row) => formatTimeSlot(row.slot_datetime) },
      { key: 'site', label: 'Site', render: (row) => row.sites?.name || '-' },
      { key: 'upstream', label: 'Upstream', render: (row) => row.upstream_pressure_psi ?? '-' },
      { key: 'downstream', label: 'Downstream', render: (row) => row.downstream_pressure_psi ?? '-' },
      { key: 'flowrate', label: 'Flowrate', render: (row) => row.flowrate_m3hr ?? '-' },
      { key: 'frequency', label: 'Frequency', render: (row) => row.vfd_frequency_hz ?? '-' },
      { key: 'l1', label: 'Volt L1', render: (row) => row.voltage_l1_v ?? '-' },
      { key: 'l2', label: 'Volt L2', render: (row) => row.voltage_l2_v ?? '-' },
      { key: 'l3', label: 'Volt L3', render: (row) => row.voltage_l3_v ?? '-' },
      { key: 'amps', label: 'Amperage', render: (row) => row.amperage_a ?? '-' },
      { key: 'tds', label: 'TDS', render: (row) => row.tds_ppm ?? '-' },
      { key: 'power', label: 'Power kWh', render: (row) => row.power_kwh_shift ?? '-' },
      { key: 'recordedAt', label: 'Recorded At', render: (row) => formatShortDateTime(row.reading_datetime) },
      { key: 'recordedBy', label: 'Recorded By', render: (row) => row.submitted_profile?.full_name || row.submitted_profile?.email || '-' },
      { key: 'remarks', label: 'Remarks', render: (row) => row.remarks || row.status || '-' },
    ],
    []
  );

  const chlorinationAverageFields = useMemo(
    () => [
      { key: 'pressure', field: 'pressure_psi', label: 'AVG PRESSURE (PSI)' },
      { key: 'rc', field: 'rc_ppm', label: 'AVG RESIDUAL CHLORINE (PPM)' },
      { key: 'turbidity', field: 'turbidity_ntu', label: 'AVG TURBIDITY (NTU)' },
      { key: 'ph', field: 'ph', label: 'AVG pH' },
      { key: 'tds', field: 'tds_ppm', label: 'AVG TDS (PPM)' },
      { key: 'tank', field: 'tank_level_liters', label: 'AVG TANK LEVEL (L)' },
      { key: 'flowrate', field: 'flowrate_m3hr', label: 'AVG FLOWRATE (M3/HR)' },
      { key: 'totalizer', field: 'totalizer', label: 'TOTALIZER', aggregate: 'previousDayDifference' },
      { key: 'power', field: 'chlorination_power_kwh', label: 'POWER CONSUMPTION (KWH)', aggregate: 'previousDayDifference' },
      { key: 'chlorine', field: 'chlorine_consumed', label: 'AVG CHLORINE USED (KG)' },
      { key: 'peroxide', field: 'peroxide_consumption', label: 'AVG PEROXIDE CONSUMPTION' },
    ],
    []
  );

  const deepwellAverageFields = useMemo(
    () => [
      { key: 'upstream', field: 'upstream_pressure_psi', label: 'AVG UPSTREAM PRESSURE (PSI)' },
      { key: 'downstream', field: 'downstream_pressure_psi', label: 'AVG DOWNSTREAM PRESSURE (PSI)' },
      { key: 'flowrate', field: 'flowrate_m3hr', label: 'AVG FLOWRATE (M3/HR)' },
      { key: 'frequency', field: 'vfd_frequency_hz', label: 'AVG VFD FREQUENCY (HZ)' },
      { key: 'l1', field: 'voltage_l1_v', label: 'AVG VOLTAGE L1 (V)' },
      { key: 'l2', field: 'voltage_l2_v', label: 'AVG VOLTAGE L2 (V)' },
      { key: 'l3', field: 'voltage_l3_v', label: 'AVG VOLTAGE L3 (V)' },
      { key: 'amps', field: 'amperage_a', label: 'AVG AMPERAGE (A)' },
      { key: 'tds', field: 'tds_ppm', label: 'AVG TDS (PPM)' },
      { key: 'power', field: 'power_kwh_shift', label: 'POWER CONSUMPTION (KWH)', aggregate: 'previousDayDifference' },
    ],
    []
  );

  const activeColumns = tableMode === CHLORINATION ? chlorinationColumns : deepwellColumns;
  const averageFields = tableMode === CHLORINATION ? chlorinationAverageFields : deepwellAverageFields;
  const siteOptions = useMemo(() => {
    const siteMap = new Map();

    items.forEach((item) => {
      const siteId = item.site_id || item.sites?.id;
      const siteName = item.sites?.name;

      if (siteId && siteName) {
        siteMap.set(siteId, siteName);
      }
    });

    return Array.from(siteMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((first, second) => first.name.localeCompare(second.name));
  }, [items]);
  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      const siteId = item.site_id || item.sites?.id || '';
      const status = item.status || '';

      if (siteFilter !== 'all' && siteId !== siteFilter) {
        return false;
      }

      if (statusFilter !== 'all' && status !== statusFilter) {
        return false;
      }

      if (normalizedSearch && !getReadingSearchText(item).includes(normalizedSearch)) {
        return false;
      }

      return true;
    });
  }, [items, searchTerm, siteFilter, statusFilter]);
  const pageSizeNumber = Math.min(100, Math.max(5, Number(pageSize) || 25));
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSizeNumber));
  const currentSafePage = Math.min(currentPage, totalPages);
  const visibleItems = filteredItems.slice((currentSafePage - 1) * pageSizeNumber, currentSafePage * pageSizeNumber);
  const statusOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.status).filter(Boolean))).sort(),
    [items]
  );
  const visibleDailyAverageRows = useMemo(() => sortRowsByDateDesc(dailyAverageRows), [dailyAverageRows]);
  const dailyAverageColumns = useMemo(
    () => [
      { key: 'date', label: 'DATE', render: (row) => row.date },
      ...averageFields.map((field) => ({
        key: field.key,
        label: field.label,
        render: (row) => formatAverageValue(row[field.key]),
      })),
    ],
    [averageFields]
  );

  async function loadHistory(nextFilters = {}) {
    setLoading(true);
    setMessage('');

    const effectiveTableMode = nextFilters.tableMode ?? tableMode;
    const effectiveFromDate = nextFilters.fromDate ?? fromDate;
    const effectiveToDate = nextFilters.toDate ?? toDate;
    const effectiveLimit = nextFilters.limit ?? limit;
    const safeLimit = Math.min(200, Math.max(1, Number(effectiveLimit) || 8));

    if (effectiveFromDate && effectiveToDate && effectiveFromDate > effectiveToDate) {
      setItems([]);
      setDailyAverageRows([]);
      setMessage('The from date must be on or before the to date.');
      setLoading(false);
      return;
    }

    try {
      const filters = {
        siteType: effectiveTableMode,
        fromDate: effectiveFromDate.trim() || undefined,
        toDate: effectiveToDate.trim() || undefined,
      };
      const averagingFilters = {
        ...filters,
        fromDate:
          effectiveTableMode === CHLORINATION && filters.fromDate
            ? shiftDateValue(filters.fromDate, -1)
            : filters.fromDate,
      };
      const fields = effectiveTableMode === CHLORINATION ? chlorinationAverageFields : deepwellAverageFields;

      const [nextItems, averagingItems] = await Promise.all([
        listReadings({ ...filters, limit: safeLimit }),
        listReadings({ ...averagingFilters }),
      ]);
      const averageRows = aggregateDailyRows(averagingItems, fields, {
        visibleFromDate: filters.fromDate,
        visibleToDate: filters.toDate,
      });

      setItems(nextItems);
      setDailyAverageRows(averageRows);
      setCurrentPage(1);
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
    if (selectedTableMode !== tableMode) {
      setTableMode(selectedTableMode);
    }
  }, [selectedTableMode]);

  useEffect(() => {
    loadHistory();
  }, [tableMode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, siteFilter, statusFilter, pageSize, visibleTable]);

  async function handleReset() {
    setFromDate('');
    setToDate('');
    setLimit('8');
    setSiteFilter('all');
    setStatusFilter('all');
    setSearchTerm('');
    setPageSize('25');
    setSelectedReading(null);
    await loadHistory({ fromDate: '', toDate: '', limit: '8' });
  }

  async function handleExport(nextFormat = exportFormat) {
    if (!items.length && !dailyAverageRows.length) {
      setMessage(`Load some readings first before exporting to ${nextFormat.toUpperCase()}.`);
      return;
    }

    if (!filteredItems.length && visibleTable === 'records') {
      setMessage(`No records match the current filters for ${nextFormat.toUpperCase()} export.`);
      return;
    }

    setExporting(true);
    setExportOpen(false);

    try {
      const fileBase = `nemexus-${tableMode.toLowerCase()}-readings-${new Date().toISOString().slice(0, 10)}`;

      if (nextFormat === 'xlsx') {
        const blob = await buildXlsxBlob([
          { name: 'Daily Averages', rows: buildTableRows(dailyAverageColumns, visibleDailyAverageRows) },
          { name: 'Detailed Readings', rows: buildTableRows(activeColumns, filteredItems) },
        ]);
        downloadBlob(blob, `${fileBase}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else if (nextFormat === 'pdf') {
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([
          import('jspdf'),
          import('jspdf-autotable'),
        ]);
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.text('NemeXus Reading History', 14, 14);
        autoTable(doc, {
          head: [dailyAverageColumns.map((column) => column.label)],
          body: visibleDailyAverageRows.map((row) => dailyAverageColumns.map((column) => column.render(row))),
          startY: 22,
          styles: { fontSize: 7 },
          headStyles: { fillColor: [17, 35, 59] },
        });
        autoTable(doc, {
          head: [activeColumns.map((column) => column.label)],
          body: filteredItems.map((row) => activeColumns.map((column) => column.render(row))),
          startY: doc.lastAutoTable.finalY + 12,
          styles: { fontSize: 6 },
          headStyles: { fillColor: [17, 35, 59] },
        });
        doc.save(`${fileBase}.pdf`);
      } else {
        const sections = [
          buildCsvSection('Daily Average Table', dailyAverageColumns, visibleDailyAverageRows),
          buildCsvSection('Detailed Readings', activeColumns, filteredItems),
        ];
        downloadBlob(`\uFEFF${sections.join('\n\n')}`, `${fileBase}.csv`, 'text/csv;charset=utf-8;');
      }

      setMessage(`Exported ${tableMode.toLowerCase()} readings as ${nextFormat.toUpperCase()}.`);
    } catch (error) {
      setMessage(error.message || 'Failed to export readings.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="readings-page">
      <section className="readings-filter-card">
        <header className="readings-filter-header">
          <div>
            <span className="readings-filter-icon">
              <Filter size={10} />
            </span>
            <h3>Office filters</h3>
          </div>
          <button type="button" className="icon-button subtle" onClick={handleReset} aria-label="Reset filters">
            <RefreshCw size={18} />
          </button>
        </header>

        <div className="readings-form-grid">
          <div className="readings-table-toggle in-filters" aria-label="Reading table display">
            <button
              type="button"
              className={visibleTable === 'averages' ? 'active' : ''}
              onClick={() => setVisibleTable('averages')}
            >
              <Table2 size={17} />
              Daily average rows
            </button>
            <button
              type="button"
              className={visibleTable === 'records' ? 'active' : ''}
              onClick={() => setVisibleTable('records')}
            >
              <List size={17} />
              {tableMode === CHLORINATION ? 'Chlorination records' : 'Deepwell records'}
            </button>
          </div>

          <label className="readings-field">
            <span>From date</span>
            <div className="input-with-icon">
              <CalendarDays size={17} />
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </div>
          </label>

          <label className="readings-field">
            <span>To date</span>
            <div className="input-with-icon">
              <CalendarDays size={17} />
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
          </label>

          <label className="readings-field full">
            <span>Limit</span>
            <div className="input-with-icon">
              <List size={17} />
              <input type="number" min="1" max="200" value={limit} onChange={(event) => setLimit(event.target.value)} />
            </div>
          </label>

          <label className="readings-field">
            <span>Site</span>
            <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
              <option value="all">All sites</option>
              {siteOptions.map((site) => (
                <option value={site.id} key={site.id}>{site.name}</option>
              ))}
            </select>
          </label>

          <label className="readings-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option value={status} key={status}>{status}</option>
              ))}
            </select>
          </label>

          <label className="readings-field full">
            <span>Search</span>
            <div className="input-with-icon">
              <Search size={17} />
              <input
                type="search"
                value={searchTerm}
                placeholder="Site, operator, status, remarks"
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </label>

          <label className="readings-field">
            <span>Rows/page</span>
            <select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>

          <div className="readings-actions full">
            <button type="button" className="load-button" disabled={loading} onClick={() => loadHistory()}>
              <RefreshCw size={17} className={loading ? 'spin' : ''} />
              {loading ? 'Loading...' : 'Load'}
            </button>
            <ExportMenu
              exporting={exporting}
              open={exportOpen}
              onToggle={() => setExportOpen((current) => !current)}
              onSelect={(nextFormat) => {
                setExportFormat(nextFormat);
                handleExport(nextFormat);
              }}
            />
          </div>
        </div>
      </section>

      {message ? <p className="readings-message">{message}</p> : null}

      {visibleTable === 'averages' ? (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h3>Daily average table</h3>
              <span>{visibleDailyAverageRows.length} row(s)</span>
            </div>
            <div className="table-wrap readings-table-wrap">
              <table>
                <thead>
                  <tr>
                    {dailyAverageColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleDailyAverageRows.length ? (
                    visibleDailyAverageRows.map((row) => (
                      <tr key={row.id}>
                        {dailyAverageColumns.map((column) => (
                          <td key={column.key}>{column.render(row)}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={dailyAverageColumns.length}>No daily averages found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h3>{tableMode === CHLORINATION ? 'Chlorination records' : 'Deepwell records'}</h3>
            <span>{filteredItems.length} of {items.length} record(s)</span>
          </div>
          <div className="table-wrap readings-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Details</th>
                  {activeColumns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleItems.length ? (
                  visibleItems.map((row) => (
                    <tr key={`${row.site_type}-${row.id}`}>
                      <td>
                        <button
                          type="button"
                          className="table-icon-button"
                          aria-label="View reading details"
                          onClick={() => setSelectedReading(row)}
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                      {activeColumns.map((column) => (
                        <td key={column.key}>{column.render(row)}</td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={activeColumns.length + 1}>No readings found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="readings-pagination">
            <span>Page {currentSafePage} of {totalPages}</span>
            <div>
              <button type="button" disabled={currentSafePage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                Previous
              </button>
              <button type="button" disabled={currentSafePage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      {selectedReading ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedReading(null)}>
          <section className="reading-detail-dialog" role="dialog" aria-modal="true" aria-label="Reading details" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="dialog-close-button" aria-label="Close details" onClick={() => setSelectedReading(null)}>
              <X size={18} />
            </button>
            <div>
              <p className="eyebrow">{selectedReading.site_type === CHLORINATION ? 'Chlorination' : 'Deepwell'}</p>
              <h3>{selectedReading.sites?.name || 'Reading details'}</h3>
            </div>
            <div className="reading-detail-grid">
              {getReadingDetailFields(selectedReading).map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
