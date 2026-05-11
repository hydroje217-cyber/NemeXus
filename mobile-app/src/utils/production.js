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

  const parsed = typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number(value);
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

export function sumForField(items, field) {
  return items
    .map((item) => parseProductionNumber(item[field]))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
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

export function readingGroupKey(item) {
  return String(item?.site_id || item?.site?.id || item?.sites?.id || 'default');
}

function groupRowsByReadingGroup(items) {
  return items.reduce((map, item) => {
    const key = readingGroupKey(item);
    const current = map.get(key) || [];
    current.push(item);
    map.set(key, current);
    return map;
  }, new Map());
}

export function previousDayDifference(date, lastValueByDate) {
  const currentValue = lastValueByDate.get(date);
  const previousValue = lastValueByDate.get(previousDayKey(date));

  if (currentValue === null || currentValue === undefined || previousValue === null || previousValue === undefined) {
    return null;
  }

  return currentValue - previousValue;
}

export function previousDayDifferenceByGroup(date, lastValueByDateAndGroup) {
  const currentGroups = lastValueByDateAndGroup.get(date);
  const previousGroups = lastValueByDateAndGroup.get(previousDayKey(date));

  if (!currentGroups || !previousGroups) {
    return null;
  }

  let total = 0;
  let count = 0;

  currentGroups.forEach((currentValue, groupKey) => {
    const previousValue = previousGroups.get(groupKey);

    if (currentValue === null || currentValue === undefined || previousValue === null || previousValue === undefined) {
      return;
    }

    const difference = currentValue - previousValue;
    if (difference < 0) {
      return;
    }

    total += difference;
    count += 1;
  });

  return count ? total : null;
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

export function dayKeyFromSummary(item) {
  return String(item?.summary_date || item?.date || '').slice(0, 10);
}

function siteTypeFromSummary(item) {
  return String(item?.site_type || item?.site?.type || item?.sites?.type || '').toUpperCase();
}

function filterSummariesBySiteType(summaries, siteType) {
  return summaries.filter((summary) => siteTypeFromSummary(summary) === siteType);
}

function isVisibleDate(date, { visibleFromDate, visibleToDate } = {}) {
  if (!date) {
    return false;
  }

  if (visibleFromDate && date < visibleFromDate) {
    return false;
  }

  if (visibleToDate && date > visibleToDate) {
    return false;
  }

  return true;
}

function buildDailySummaryMap(summaries, field, options = {}) {
  return summaries.reduce((map, summary) => {
    const date = dayKeyFromSummary(summary);
    const value = parseProductionNumber(summary[field]);
    if (!isVisibleDate(date, options) || value === null) {
      return map;
    }

    map.set(date, (map.get(date) || 0) + value);
    return map;
  }, new Map());
}

function buildDailyAggregateMap(rows, valueKey) {
  return rows.reduce((map, row) => {
    const value = parseProductionNumber(row[valueKey]);
    if (value !== null) {
      map.set(row.date, value);
    }

    return map;
  }, new Map());
}

function mergeDailyMaps({ liveMap, summaryMap }) {
  const merged = new Map(summaryMap);
  liveMap.forEach((value, date) => {
    merged.set(date, value);
  });
  return merged;
}

export function aggregateDailyRows(items, fieldConfigs, options = {}) {
  const { visibleFromDate, visibleToDate } = options;
  const grouped = groupReadingsByDay(items);
  const sortedEntries = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const previousDayDifferenceMaps = fieldConfigs.reduce((maps, config) => {
    if (config.aggregate === 'previousDayDifference') {
      maps[config.key] = new Map(
        sortedEntries.map(([date, rows]) => [
          date,
          new Map(
            Array.from(groupRowsByReadingGroup(rows).entries()).map(([groupKey, groupRows]) => [
              groupKey,
              lastNumericValueForDay(groupRows, config.field),
            ])
          ),
        ])
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
        if (config.aggregate === 'previousDayDifference') {
          result[config.key] = previousDayDifferenceByGroup(date, previousDayDifferenceMaps[config.key]);
          return;
        }

        if (config.aggregate === 'sum') {
          result[config.key] = sumForField(rows, config.field);
          return;
        }

        result[config.key] = averageForField(rows, config.field);
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
  const { now = new Date(), monthCount = DEFAULT_MONTHLY_PRODUCTION_MONTH_COUNT, dailySummaries = [] } = options;
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

  const productionByDate = mergeDailyMaps({
    liveMap: buildDailyAggregateMap(buildDailyTotalizerRows(readings, { visibleFromDate, visibleToDate }), 'totalizer'),
    summaryMap: buildDailySummaryMap(filterSummariesBySiteType(dailySummaries, 'CHLORINATION'), 'production_m3', {
      visibleFromDate,
      visibleToDate,
    }),
  });

  productionByDate.forEach((production, date) => {
    const monthKey = date.slice(0, 7);
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
  const { now = new Date(), dailySummaries = [] } = options;
  const firstVisibleDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const visibleFromDate = createDayKey(firstVisibleDay);
  const visibleToDate = createDayKey(now);
  const productionByDate = mergeDailyMaps({
    liveMap: buildDailyAggregateMap(buildDailyTotalizerRows(readings, { visibleFromDate, visibleToDate }), 'totalizer'),
    summaryMap: buildDailySummaryMap(filterSummariesBySiteType(dailySummaries, 'CHLORINATION'), 'production_m3', {
      visibleFromDate,
      visibleToDate,
    }),
  });
  const rows = [];

  for (let date = new Date(firstVisibleDay); date <= now; date.setDate(date.getDate() + 1)) {
    const key = createDayKey(date);
    const production = parseProductionNumber(productionByDate.get(key)) ?? 0;

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
  const { now = new Date(), dailySummaries = [] } = options;
  const firstVisibleDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const visibleFromDate = createDayKey(firstVisibleDay);
  const visibleToDate = createDayKey(now);
  const summaryOptions = { visibleFromDate, visibleToDate };
  const chlorinationRowsByDate = mergeDailyMaps({
    liveMap: buildDailyAggregateMap(
      aggregateDailyRows(
        chlorinationReadings,
        [{ key: 'power', field: 'chlorination_power_kwh', aggregate: 'sum' }],
        summaryOptions
      ),
      'power'
    ),
    summaryMap: buildDailySummaryMap(filterSummariesBySiteType(dailySummaries, 'CHLORINATION'), 'power_kwh', summaryOptions),
  });
  const deepwellRowsByDate = mergeDailyMaps({
    liveMap: buildDailyAggregateMap(
      aggregateDailyRows(deepwellReadings, [{ key: 'power', field: 'power_kwh_shift', aggregate: 'sum' }], summaryOptions),
      'power'
    ),
    summaryMap: buildDailySummaryMap(filterSummariesBySiteType(dailySummaries, 'DEEPWELL'), 'power_kwh', summaryOptions),
  });
  const rows = [];

  for (let date = new Date(firstVisibleDay); date <= now; date.setDate(date.getDate() + 1)) {
    const key = createDayKey(date);
    const chlorinationPower = parseProductionNumber(chlorinationRowsByDate.get(key)) ?? 0;
    const deepwellPower = parseProductionNumber(deepwellRowsByDate.get(key)) ?? 0;

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

function addDailyMapToMonthlyRows({ rowsByMonth, valueByDate, targetKey }) {
  valueByDate.forEach((value, date) => {
    const parsed = parseProductionNumber(value);
    if (parsed === null) {
      return;
    }

    const row = rowsByMonth.get(date.slice(0, 7));
    if (!row) {
      return;
    }

    row[targetKey] = (row[targetKey] || 0) + parsed;
  });
}

export function buildMonthlyPowerConsumption({ chlorinationReadings = [], deepwellReadings = [] } = {}, options = {}) {
  const { now = new Date(), monthCount = DEFAULT_MONTHLY_PRODUCTION_MONTH_COUNT, dailySummaries = [] } = options;
  const { firstVisibleMonth, rowsByMonth } = createMonthlyRows({ now, monthCount });
  const visibleFromDate = createDayKey(firstVisibleMonth);
  const visibleToDate = createDayKey(now);
  const summaryOptions = { visibleFromDate, visibleToDate };
  const chlorinationPowerByDate = mergeDailyMaps({
    liveMap: buildDailyAggregateMap(
      aggregateDailyRows(
        chlorinationReadings,
        [{ key: 'power', field: 'chlorination_power_kwh', aggregate: 'sum' }],
        summaryOptions
      ),
      'power'
    ),
    summaryMap: buildDailySummaryMap(filterSummariesBySiteType(dailySummaries, 'CHLORINATION'), 'power_kwh', summaryOptions),
  });
  const deepwellPowerByDate = mergeDailyMaps({
    liveMap: buildDailyAggregateMap(
      aggregateDailyRows(deepwellReadings, [{ key: 'power', field: 'power_kwh_shift', aggregate: 'sum' }], summaryOptions),
      'power'
    ),
    summaryMap: buildDailySummaryMap(filterSummariesBySiteType(dailySummaries, 'DEEPWELL'), 'power_kwh', summaryOptions),
  });

  rowsByMonth.forEach((row) => {
    row.chlorinationPower = 0;
    row.deepwellPower = 0;
  });

  addDailyMapToMonthlyRows({ rowsByMonth, valueByDate: chlorinationPowerByDate, targetKey: 'chlorinationPower' });
  addDailyMapToMonthlyRows({ rowsByMonth, valueByDate: deepwellPowerByDate, targetKey: 'deepwellPower' });

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

export function buildMonthlyChemicalUsage(chlorinationReadings = [], options = {}) {
  const { now = new Date(), monthCount = DEFAULT_MONTHLY_PRODUCTION_MONTH_COUNT, dailySummaries = [] } = options;
  const { firstVisibleMonth, rowsByMonth } = createMonthlyRows({ now, monthCount });
  const visibleFromDate = createDayKey(firstVisibleMonth);
  const visibleToDate = createDayKey(now);
  const summaryOptions = { visibleFromDate, visibleToDate };
  const chlorinationSummaries = filterSummariesBySiteType(dailySummaries, 'CHLORINATION');
  const chemicalRows = aggregateDailyRows(
    chlorinationReadings,
    [
      { key: 'chlorine', field: 'chlorine_consumed', aggregate: 'sum' },
      { key: 'peroxide', field: 'peroxide_consumption', aggregate: 'sum' },
    ],
    summaryOptions
  );
  const chlorineByDate = mergeDailyMaps({
    liveMap: buildDailyAggregateMap(chemicalRows, 'chlorine'),
    summaryMap: buildDailySummaryMap(chlorinationSummaries, 'chlorine_kg', summaryOptions),
  });
  const peroxideByDate = mergeDailyMaps({
    liveMap: buildDailyAggregateMap(chemicalRows, 'peroxide'),
    summaryMap: buildDailySummaryMap(chlorinationSummaries, 'peroxide_liters', summaryOptions),
  });

  rowsByMonth.forEach((row) => {
    row.chlorineUsage = 0;
    row.peroxideUsage = 0;
  });

  addDailyMapToMonthlyRows({ rowsByMonth, valueByDate: chlorineByDate, targetKey: 'chlorineUsage' });
  addDailyMapToMonthlyRows({ rowsByMonth, valueByDate: peroxideByDate, targetKey: 'peroxideUsage' });

  const rows = Array.from(rowsByMonth.values())
    .map((row) => ({
      ...row,
      totalUsage: row.chlorineUsage + row.peroxideUsage,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));

  return {
    totalChlorine: rows.reduce((sum, row) => sum + row.chlorineUsage, 0),
    totalPeroxide: rows.reduce((sum, row) => sum + row.peroxideUsage, 0),
    rows,
  };
}
