import { basename, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import XLSX from 'xlsx';

const SOURCE = 'excel_daily_report';

const COLUMNS = [
  'site_id',
  'summary_date',
  'source',
  'source_file',
  'production_m3',
  'power_kwh',
  'chlorine_kg',
  'avg_flowrate_m3hr',
  'avg_pressure_psi',
  'avg_rc_ppm',
  'avg_turbidity_ntu',
  'avg_ph',
  'avg_tds_ppm',
  'peroxide_liters',
  'operating_hours',
  'scheduled_downtime_hours',
  'unscheduled_downtime_hours',
  'avg_upstream_pressure_psi',
  'avg_downstream_pressure_psi',
  'avg_vfd_frequency_hz',
  'avg_voltage_l1_v',
  'avg_voltage_l2_v',
  'avg_voltage_l3_v',
  'avg_amperage_a',
];

const SOURCE_ROW_COLUMNS = ['site_name', 'site_type', ...COLUMNS.filter((column) => column !== 'site_id')];

const SHEETS = {
  'Chlorination House': {
    siteName: 'Main Chlorination Facility',
    siteType: 'CHLORINATION',
    mapRow(row) {
      return {
        production_m3: numeric(row[1]),
        power_kwh: numeric(row[2]),
        chlorine_kg: numeric(row[3]),
        avg_flowrate_m3hr: numeric(row[4]),
        avg_pressure_psi: numeric(row[5]),
        avg_rc_ppm: numeric(row[6]),
        avg_turbidity_ntu: numeric(row[7]),
        avg_ph: numeric(row[8]),
        avg_tds_ppm: numeric(row[9]),
        peroxide_liters: numeric(row[10]),
        operating_hours: numeric(row[11]),
        scheduled_downtime_hours: numeric(row[12]),
        unscheduled_downtime_hours: numeric(row[13]),
      };
    },
  },
  'Deepwell House': {
    siteName: 'Main Deepwell Pump',
    siteType: 'DEEPWELL',
    mapRow(row) {
      return {
        power_kwh: numeric(row[1]),
        avg_upstream_pressure_psi: numeric(row[2]),
        avg_downstream_pressure_psi: numeric(row[3]),
        avg_vfd_frequency_hz: numeric(row[4]),
        avg_voltage_l1_v: numeric(row[5]),
        avg_voltage_l2_v: numeric(row[6]),
        avg_voltage_l3_v: numeric(row[7]),
        avg_amperage_a: numeric(row[8]),
        avg_tds_ppm: numeric(row[9]),
      };
    },
  },
};

function usage() {
  return [
    'Usage:',
    '  npm run generate:daily-summary-import -- "C:\\\\path\\\\to\\\\DAILY PRODUCTION REPORT_BABRUGO III.xlsx" --out supabase/import-daily-site-summaries.sql',
    '',
    'If --out is omitted, SQL is printed to stdout.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = [...argv];
  const input = args.find((arg) => !arg.startsWith('--'));
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args[outIndex + 1] : null;

  if (!input || (outIndex >= 0 && !out)) {
    throw new Error(usage());
  }

  return {
    inputPath: resolve(input),
    outPath: out ? resolve(out) : null,
  };
}

function dateFromCell(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return [
        String(parsed.y).padStart(4, '0'),
        String(parsed.m).padStart(2, '0'),
        String(parsed.d).padStart(2, '0'),
      ].join('-');
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

function numeric(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'string' ? Number(value.replace(/,/g, '').trim()) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sqlString(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumeric(value) {
  return value === null || value === undefined ? 'null' : String(value);
}

function hasImportedValue(row) {
  return COLUMNS
    .filter((column) => !['site_id', 'summary_date', 'source', 'source_file'].includes(column))
    .some((column) => row[column] !== null && row[column] !== undefined);
}

function parseWorkbook(inputPath) {
  const workbook = XLSX.readFile(inputPath, { cellDates: false });
  const sourceFile = basename(inputPath);
  const rows = [];

  for (const [sheetName, config] of Object.entries(SHEETS)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error(`Missing expected sheet: ${sheetName}`);
    }

    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    for (const row of matrix.slice(2)) {
      const summaryDate = dateFromCell(row[0]);
      if (!summaryDate) {
        continue;
      }

      const mapped = {
        summary_date: summaryDate,
        source: SOURCE,
        source_file: sourceFile,
        ...config.mapRow(row),
      };

      if (!hasImportedValue(mapped)) {
        continue;
      }

      rows.push({
        site_name: config.siteName,
        site_type: config.siteType,
        ...mapped,
      });
    }
  }

  return rows;
}

function rowToSqlTuple(row) {
  return `(${SOURCE_ROW_COLUMNS.map((column) => {
    if (['site_name', 'site_type', 'summary_date', 'source', 'source_file'].includes(column)) {
      return sqlString(row[column]);
    }

    return sqlNumeric(row[column]);
  }).join(', ')})`;
}

function buildSql(rows) {
  const updateColumns = COLUMNS.filter((column) => !['site_id', 'summary_date'].includes(column));

  if (!rows.length) {
    return '-- No populated daily summary rows were found in the workbook.\n';
  }

  return `insert into public.sites (name, type)
values
  ('Main Chlorination Facility', 'CHLORINATION'),
  ('Main Deepwell Pump', 'DEEPWELL')
on conflict (name) do nothing;

with source_rows (${SOURCE_ROW_COLUMNS.join(', ')}) as (
  values
  ${rows.map(rowToSqlTuple).join(',\n  ')}
),
resolved_rows as (
  select
    sites.id as site_id,
    source_rows.summary_date::date,
    source_rows.source,
    source_rows.source_file,
    source_rows.production_m3,
    source_rows.power_kwh,
    source_rows.chlorine_kg,
    source_rows.avg_flowrate_m3hr,
    source_rows.avg_pressure_psi,
    source_rows.avg_rc_ppm,
    source_rows.avg_turbidity_ntu,
    source_rows.avg_ph,
    source_rows.avg_tds_ppm,
    source_rows.peroxide_liters,
    source_rows.operating_hours,
    source_rows.scheduled_downtime_hours,
    source_rows.unscheduled_downtime_hours,
    source_rows.avg_upstream_pressure_psi,
    source_rows.avg_downstream_pressure_psi,
    source_rows.avg_vfd_frequency_hz,
    source_rows.avg_voltage_l1_v,
    source_rows.avg_voltage_l2_v,
    source_rows.avg_voltage_l3_v,
    source_rows.avg_amperage_a
  from source_rows
  join public.sites as sites
    on sites.name = source_rows.site_name
   and sites.type = source_rows.site_type
)
insert into public.daily_site_summaries (${COLUMNS.join(', ')})
select ${COLUMNS.join(', ')}
from resolved_rows
on conflict (site_id, summary_date) do update
set
  ${updateColumns.map((column) => `${column} = excluded.${column}`).join(',\n  ')},
  updated_at = timezone('utc', now());
`;
}

const { inputPath, outPath } = parseArgs(process.argv.slice(2));
const sql = buildSql(parseWorkbook(inputPath));

if (outPath) {
  await writeFile(outPath, sql, 'utf8');
  console.log(`Wrote ${outPath}`);
} else {
  process.stdout.write(sql);
}
