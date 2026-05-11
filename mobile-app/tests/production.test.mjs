import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'src', 'utils', 'production.js');
const tempDir = await mkdtemp(path.join(tmpdir(), 'nemexus-production-'));
const tempModulePath = path.join(tempDir, 'production.mjs');

try {
  await writeFile(tempModulePath, await readFile(sourcePath, 'utf8'));

  const {
    aggregateDailyRows,
    buildDailyProduction,
    buildDailyTotalizerRows,
    buildMonthlyChemicalUsage,
    buildMonthlyProduction,
    buildMonthlyPowerConsumption,
    startOfMonthlyProductionSourceIso,
  } = await import(pathToFileURL(tempModulePath).href);

  const readings = [
    { slot_datetime: '2026-01-31T23:30:00.000Z', totalizer: 900, pressure_psi: 40 },
    { slot_datetime: '2026-02-01T08:00:00.000Z', totalizer: 950, pressure_psi: 42 },
    { slot_datetime: '2026-02-01T23:30:00.000Z', totalizer: 980, pressure_psi: 46 },
    { slot_datetime: '2026-02-02T23:30:00.000Z', totalizer: 1030, pressure_psi: 44 },
  ];

  const dailyTotalizerRows = buildDailyTotalizerRows(readings, {
    visibleFromDate: '2026-02-01',
    visibleToDate: '2026-02-02',
  });

  assert.deepEqual(dailyTotalizerRows, [
    { date: '2026-02-01', totalizer: 80 },
    { date: '2026-02-02', totalizer: 50 },
  ]);

  const averageRows = aggregateDailyRows(
    readings,
    [
      { key: 'pressure', field: 'pressure_psi' },
      { key: 'totalizer', field: 'totalizer', aggregate: 'previousDayDifference' },
    ],
    {
      visibleFromDate: '2026-02-01',
      visibleToDate: '2026-02-02',
    }
  );

  assert.equal(averageRows[0].pressure, 44);
  assert.equal(averageRows[0].totalizer, 80);
  assert.equal(averageRows[1].pressure, 44);
  assert.equal(averageRows[1].totalizer, 50);

  const noPreviousRows = buildDailyTotalizerRows(readings.slice(1), {
    visibleFromDate: '2026-02-01',
    visibleToDate: '2026-02-01',
  });

  assert.deepEqual(noPreviousRows, [{ date: '2026-02-01', totalizer: null }]);

  const multiSiteRows = buildDailyTotalizerRows(
    [
      { site_id: 1, slot_datetime: '2026-01-31T23:30:00.000Z', totalizer: 1000 },
      { site_id: 2, slot_datetime: '2026-01-31T23:30:00.000Z', totalizer: 5000 },
      { site_id: 1, slot_datetime: '2026-02-01T23:30:00.000Z', totalizer: 1120 },
      { site_id: 2, slot_datetime: '2026-02-01T23:30:00.000Z', totalizer: 5160 },
      { site_id: 1, slot_datetime: '2026-02-02T23:30:00.000Z', totalizer: 1240 },
      { site_id: 2, slot_datetime: '2026-02-02T23:30:00.000Z', totalizer: 90 },
    ],
    {
      visibleFromDate: '2026-02-01',
      visibleToDate: '2026-02-02',
    }
  );

  assert.deepEqual(multiSiteRows, [
    { date: '2026-02-01', totalizer: 280 },
    { date: '2026-02-02', totalizer: 120 },
  ]);

  const monthlyProduction = buildMonthlyProduction(readings, {
    now: new Date('2026-02-28T12:00:00.000Z'),
    monthCount: 2,
  });

  assert.deepEqual(
    monthlyProduction.rows.map((row) => row.key),
    ['2026-02', '2026-01']
  );
  assert.equal(monthlyProduction.rows[0].production, 130);
  assert.equal(monthlyProduction.rows[1].production, 0);
  assert.equal(monthlyProduction.totalProduction, 130);
  assert.equal(monthlyProduction.averageProduction, 130);

  const dailyProduction = buildDailyProduction(readings, {
    now: new Date('2026-02-02T12:00:00.000Z'),
  });

  assert.deepEqual(
    dailyProduction.rows.map((row) => [row.date, row.production]),
    [
      ['2026-02-02', 50],
      ['2026-02-01', 80],
    ]
  );
  assert.equal(dailyProduction.monthLabel, 'February 2026');
  assert.equal(dailyProduction.totalProduction, 130);

  const powerConsumption = buildMonthlyPowerConsumption(
    {
      chlorinationReadings: [
        { slot_datetime: '2026-02-01T23:30:00.000Z', chlorination_power_kwh: 40 },
        { slot_datetime: '2026-02-02T23:30:00.000Z', chlorination_power_kwh: 60 },
      ],
      deepwellReadings: [
        { slot_datetime: '2026-02-01T08:00:00.000Z', power_kwh_shift: 50 },
        { slot_datetime: '2026-02-01T18:00:00.000Z', power_kwh_shift: 50 },
        { slot_datetime: '2026-02-02T18:00:00.000Z', power_kwh_shift: 150 },
      ],
    },
    {
      now: new Date('2026-02-28T12:00:00.000Z'),
      monthCount: 2,
    }
  );

  assert.deepEqual(
    powerConsumption.rows.map((row) => row.key),
    ['2026-02', '2026-01']
  );
  assert.equal(powerConsumption.rows[0].chlorinationPower, 100);
  assert.equal(powerConsumption.rows[0].deepwellPower, 250);
  assert.equal(powerConsumption.rows[0].totalPower, 350);
  assert.equal(powerConsumption.totalPower, 350);

  const chemicalUsage = buildMonthlyChemicalUsage(
    [
      { slot_datetime: '2026-02-01T08:00:00.000Z', chlorine_consumed: 4, peroxide_consumption: 1.5 },
      { slot_datetime: '2026-02-01T16:00:00.000Z', chlorine_consumed: 5, peroxide_consumption: 1.25 },
      { slot_datetime: '2026-02-02T16:00:00.000Z', chlorine_consumed: 6, peroxide_consumption: 2 },
    ],
    {
      now: new Date('2026-02-28T12:00:00.000Z'),
      monthCount: 2,
    }
  );

  assert.deepEqual(
    chemicalUsage.rows.map((row) => row.key),
    ['2026-02', '2026-01']
  );
  assert.equal(chemicalUsage.rows[0].chlorineUsage, 15);
  assert.equal(chemicalUsage.rows[0].peroxideUsage, 4.75);
  assert.equal(chemicalUsage.rows[0].totalUsage, 19.75);
  assert.equal(chemicalUsage.totalChlorine, 15);
  assert.equal(chemicalUsage.totalPeroxide, 4.75);

  assert.equal(
    startOfMonthlyProductionSourceIso({
      now: new Date('2026-02-15T12:00:00.000Z'),
      monthCount: 2,
    }),
    new Date(2025, 11, 31).toISOString()
  );

  console.log('production utility tests passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
