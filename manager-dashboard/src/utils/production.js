const DEFAULT_MONTHLY_PRODUCTION_MONTH_COUNT = 10;

export function createDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function createMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function createMonthLabel(date) {
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${month}-${String(date.getFullYear()).slice(-2)}`;
}

export function createFullMonthLabel(date) {
  const month = date.toLocaleString('en-US', { month: 'long' });
  return `${month} ${date.getFullYear()}`;
}

export function startOfMonthlyProductionSourceIso({
  now = new Date(),
  monthCount = DEFAULT_MONTHLY_PRODUCTION_MONTH_COUNT,
} = {}) {
  const start = new Date(now.getFullYear(), now.getMonth() - monthCount + 1, 1);
  return new Date(start.getFullYear(), start.getMonth(), 0).toISOString();
}

export function parseProductionNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dayKeyFromReading(item) {
  const value = item?.slot_datetime || item?.reading_datetime || item?.created_at;
  return String(value || '').slice(0, 10);
}

export function getReadingTime(item) {
  const parsed = new Date(item?.slot_datetime || item?.reading_datetime || item?.created_at || '');
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function previousDayKey(dateKey) {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

export function averageForField(items, field) {
  const values = items
    .map((item) => parseProductionNumber(item[field]))
    .filter((value) => value !== null);

  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

export function lastNumericValueForDay(items, field) {
  const values = items
    .map((item) => ({
      value: parseProductionNumber(item[field]),
      timestamp: getReadingTime(item),
    }))
    .filter((item) => item.value !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!values.length) {
    return null;
  }

  return values[values.length - 1].value;
}

export function previousDayDifference(date, lastValueByDate) {
  const currentValue = lastValueByDate.get(date);
  const previousValue = lastValueByDate.get(previousDayKey(date));

  if (currentValue === null || currentValue === undefined || previousValue === null || previousValue === undefined) {
    return null;
  }

  return currentValue - previousValue;
}

export function groupReadingsByDay(items) {
  return items.reduce((map, item) => {
    const key = dayKeyFromReading(item);
    if (!key) {
      return map;
    }

    const current = map.get(key) || [];
    current.push(item);
    map.set(key, current);
    return map;
  }, new Map());
}

export function aggregateDailyRows(items, fieldConfigs, options = {}) {
  const { visibleFromDate, visibleToDate } = options;
  const grouped = groupReadingsByDay(items);
  const sortedEntries = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const previousDayDifferenceMaps = fieldConfigs.reduce((maps, config) => {
    if (config.aggregate === 'previousDayDifference') {
      maps[config.key] = new Map(
        sortedEntries.map(([date, rows]) => [date, lastNumericValueForDay(rows, config.field)])
      );
    }

    return maps;
  }, {});

  return sortedEntries
    .filter(([date]) => {
      if (visibleFromDate && date < visibleFromDate) {
        return false;
      }

      if (visibleToDate && date > visibleToDate) {
        return false;
      }

      return true;
    })
    .map(([date, rows]) => {
      const result = {
        id: `avg:${date}`,
        date,
      };

      fieldConfigs.forEach((config) => {
        result[config.key] =
          config.aggregate === 'previousDayDifference'
            ? previousDayDifference(date, previousDayDifferenceMaps[config.key])
            : averageForField(rows, config.field);
      });

      return result;
    });
}

export function buildDailyTotalizerRows(readings, options = {}) {
  return aggregateDailyRows(
    readings,
    [{ key: 'totalizer', field: 'totalizer', aggregate: 'previousDayDifference' }],
    options
  ).map((row) => ({
    date: row.date,
    totalizer: row.totalizer,
  }));
}

export function buildMonthlyProduction(readings, options = {}) {
  const { now = new Date(), monthCount = DEFAULT_MONTHLY_PRODUCTION_MONTH_COUNT } = options;
  const firstVisibleMonth = new Date(now.getFullYear(), now.getMonth() - monthCount + 1, 1);
  const lastVisibleMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const visibleFromDate = createDayKey(firstVisibleMonth);
  const visibleToDate = createDayKey(now);
  const rowsByMonth = new Map();

  for (let date = new Date(firstVisibleMonth); date <= lastVisibleMonth; date.setMonth(date.getMonth() + 1)) {
    const key = createMonthKey(date);
    rowsByMonth.set(key, {
      key,
      label: createMonthLabel(date),
      production: 0,
      total: 0,
      readingCount: 0,
    });
  }

  buildDailyTotalizerRows(readings, { visibleFromDate, visibleToDate }).forEach((dailyRow) => {
    const production = parseProductionNumber(dailyRow.totalizer);
    if (production === null) {
      return;
    }

    const monthKey = dailyRow.date.slice(0, 7);
    const row = rowsByMonth.get(monthKey);
    if (!row) {
      return;
    }

    row.production += production;
    row.total += production;
    row.readingCount += 1;
  });

  const rows = Array.from(rowsByMonth.values()).sort((a, b) => b.key.localeCompare(a.key));
  const monthsWithProduction = rows.filter((row) => row.total > 0);
  const productionTotal = rows.reduce((sum, row) => sum + row.production, 0);

  return {
    totalProduction: productionTotal,
    averageProduction: monthsWithProduction.length ? productionTotal / monthsWithProduction.length : 0,
    rows,
  };
}

export function buildDailyProduction(readings, options = {}) {
  const { now = new Date() } = options;
  const firstVisibleDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const visibleFromDate = createDayKey(firstVisibleDay);
  const visibleToDate = createDayKey(now);
  const dailyRowsByDate = new Map(
    buildDailyTotalizerRows(readings, { visibleFromDate, visibleToDate }).map((row) => [row.date, row])
  );
  const rows = [];

  for (let date = new Date(firstVisibleDay); date <= now; date.setDate(date.getDate() + 1)) {
    const key = createDayKey(date);
    const dailyRow = dailyRowsByDate.get(key);
    const production = parseProductionNumber(dailyRow?.totalizer) ?? 0;

    rows.push({
      key,
      date: key,
      label: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`,
      production,
    });
  }

  rows.sort((a, b) => b.key.localeCompare(a.key));

  return {
    monthLabel: createFullMonthLabel(now),
    totalProduction: rows.reduce((sum, row) => sum + row.production, 0),
    rows,
  };
}

export function buildDailyPowerConsumption({ chlorinationReadings = [], deepwellReadings = [] } = {}, options = {}) {
  const { now = new Date() } = options;
  const firstVisibleDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const visibleFromDate = createDayKey(firstVisibleDay);
  const visibleToDate = createDayKey(now);
  const chlorinationRowsByDate = new Map(
    aggregateDailyRows(
      chlorinationReadings,
      [{ key: 'power', field: 'chlorination_power_kwh', aggregate: 'previousDayDifference' }],
      { visibleFromDate, visibleToDate }
    ).map((row) => [row.date, row])
  );
  const deepwellRowsByDate = new Map(
    aggregateDailyRows(
      deepwellReadings,
      [{ key: 'power', field: 'power_kwh_shift', aggregate: 'previousDayDifference' }],
      { visibleFromDate, visibleToDate }
    ).map((row) => [row.date, row])
  );
  const rows = [];

  for (let date = new Date(firstVisibleDay); date <= now; date.setDate(date.getDate() + 1)) {
    const key = createDayKey(date);
    const chlorinationPower = parseProductionNumber(chlorinationRowsByDate.get(key)?.power) ?? 0;
    const deepwellPower = parseProductionNumber(deepwellRowsByDate.get(key)?.power) ?? 0;

    rows.push({
      key,
      date: key,
      label: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`,
      chlorinationPower,
      deepwellPower,
      totalPower: chlorinationPower + deepwellPower,
    });
  }

  rows.sort((a, b) => b.key.localeCompare(a.key));

  return {
    monthLabel: createFullMonthLabel(now),
    totalPower: rows.reduce((sum, row) => sum + row.totalPower, 0),
    rows,
  };
}

function createMonthlyRows({ now, monthCount }) {
  const firstVisibleMonth = new Date(now.getFullYear(), now.getMonth() - monthCount + 1, 1);
  const lastVisibleMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const rowsByMonth = new Map();

  for (let date = new Date(firstVisibleMonth); date <= lastVisibleMonth; date.setMonth(date.getMonth() + 1)) {
    const key = createMonthKey(date);
    rowsByMonth.set(key, {
      key,
      label: createMonthLabel(date),
    });
  }

  return {
    firstVisibleMonth,
    rowsByMonth,
  };
}

function addDailyAggregateToMonthlyRows({ rowsByMonth, rows, valueKey, targetKey }) {
  rows.forEach((dailyRow) => {
    const value = parseProductionNumber(dailyRow[valueKey]);
    if (value === null) {
      return;
    }

    const monthKey = dailyRow.date.slice(0, 7);
    const row = rowsByMonth.get(monthKey);
    if (!row) {
      return;
    }

    row[targetKey] = (row[targetKey] || 0) + value;
  });
}

export function buildMonthlyPowerConsumption({ chlorinationReadings = [], deepwellReadings = [] } = {}, options = {}) {
  const { now = new Date(), monthCount = DEFAULT_MONTHLY_PRODUCTION_MONTH_COUNT } = options;
  const { firstVisibleMonth, rowsByMonth } = createMonthlyRows({ now, monthCount });
  const visibleFromDate = createDayKey(firstVisibleMonth);
  const visibleToDate = createDayKey(now);
  const chlorinationRows = aggregateDailyRows(
    chlorinationReadings,
    [{ key: 'power', field: 'chlorination_power_kwh', aggregate: 'previousDayDifference' }],
    { visibleFromDate, visibleToDate }
  );
  const deepwellRows = aggregateDailyRows(
    deepwellReadings,
    [{ key: 'power', field: 'power_kwh_shift', aggregate: 'previousDayDifference' }],
    { visibleFromDate, visibleToDate }
  );

  rowsByMonth.forEach((row) => {
    row.chlorinationPower = 0;
    row.deepwellPower = 0;
  });

  addDailyAggregateToMonthlyRows({
    rowsByMonth,
    rows: chlorinationRows,
    valueKey: 'power',
    targetKey: 'chlorinationPower',
  });
  addDailyAggregateToMonthlyRows({
    rowsByMonth,
    rows: deepwellRows,
    valueKey: 'power',
    targetKey: 'deepwellPower',
  });

  const rows = Array.from(rowsByMonth.values())
    .map((row) => ({
      ...row,
      totalPower: row.chlorinationPower + row.deepwellPower,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
  const totalPower = rows.reduce((sum, row) => sum + row.totalPower, 0);

  return {
    totalPower,
    rows,
  };
}
