import { useState } from 'react';
import { BarChart3, CalendarDays, Clock, Droplets, FlaskConical, Grid3X3, History, Hourglass, Minus, Plus, RotateCcw, Zap } from 'lucide-react';
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const MIN_CHART_ZOOM = 0.75;
const MAX_CHART_ZOOM = 2;
const CHART_ZOOM_STEP = 0.25;

function formatNumber(value, decimals = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '-';
  }

  return parsed.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function clampZoom(value) {
  return Math.min(MAX_CHART_ZOOM, Math.max(MIN_CHART_ZOOM, Number(value.toFixed(2))));
}

function ZoomControls({ zoomLevel, onZoomIn, onZoomOut, onReset }) {
  const zoomPercent = Math.round(zoomLevel * 100);
  const canZoomOut = zoomLevel > MIN_CHART_ZOOM;
  const canZoomIn = zoomLevel < MAX_CHART_ZOOM;

  return (
    <div className="chart-toolbar" aria-label="Chart zoom controls">
      <span>Zoom</span>
      <div>
        <button type="button" aria-label="Zoom out" disabled={!canZoomOut} onClick={onZoomOut}>
          <Minus size={15} />
        </button>
        <button type="button" aria-label="Reset zoom" disabled={zoomLevel === 1} onClick={onReset}>
          <RotateCcw size={14} />
          {zoomPercent}%
        </button>
        <button type="button" aria-label="Zoom in" disabled={!canZoomIn} onClick={onZoomIn}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  icon: Icon,
  summaryLabel,
  summaryValue,
  summaryHint,
  summaryItems,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onReset,
  children,
}) {
  return (
    <section className="analytics-panel">
      <header className="analytics-heading">
        <div>
          <span className="section-icon">
            <Icon size={16} />
          </span>
          <h3>{title}</h3>
        </div>
      </header>
      <div className={summaryItems?.length ? 'summary-pill-grid' : undefined}>
        {(summaryItems?.length ? summaryItems : [{ label: summaryLabel, value: summaryValue, hint: summaryHint, icon: Icon }]).map((item) => {
          const SummaryIcon = item.icon || Icon;
          return (
            <div className="summary-pill" key={item.label}>
              <span className="summary-icon">
                <SummaryIcon size={18} />
              </span>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                {item.hint ? <small>{item.hint}</small> : null}
              </div>
            </div>
          );
        })}
      </div>
      <ZoomControls zoomLevel={zoomLevel} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onReset} />
      {children}
    </section>
  );
}

function getChartWidth(rowCount, zoomLevel, daily = false) {
  const baseColumnWidth = daily ? 54 : 78;
  const baseMinimumWidth = daily ? 760 : 600;

  return Math.max(baseMinimumWidth, Math.round(rowCount * baseColumnWidth * zoomLevel));
}

function formatAxisNumber(value) {
  return formatNumber(value, 0);
}

function TooltipContent({ active, label, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const orderedPayload = [...payload].reverse();

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {orderedPayload.map((item) => (
        <span key={item.dataKey} style={{ '--tooltip-color': item.color }}>
          {item.name}: {formatNumber(item.value)}
        </span>
      ))}
    </div>
  );
}

function ChartValueLabel({ x, y, width, value }) {
  if (!value || value <= 0) {
    return null;
  }

  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" className="recharts-total-label">
      {formatNumber(value)}
    </text>
  );
}

function StackSegmentLabel({ x, y, width, height, value, fill }) {
  if (!value || value <= 0 || height < 32 || width < 24) {
    return null;
  }

  const isDeepwell = fill === '#f59e0b';

  return (
    <text
      x={x + width / 2}
      y={y + height / 2 + 4}
      textAnchor="middle"
      className={isDeepwell ? 'recharts-stack-label dark' : 'recharts-stack-label'}
    >
      {formatNumber(value)}
    </text>
  );
}

function SimpleBarChart({ rows, valueKey, emptyMessage, zoomLevel, daily = false }) {
  const visibleRows = rows ?? [];
  const chartRows = visibleRows.map((row) => ({
    label: row.label,
    value: Number(row[valueKey]) || 0,
  }));
  const hasData = visibleRows.some((row) => Number(row[valueKey]) > 0);
  const chartWidth = getChartWidth(chartRows.length, zoomLevel, daily);
  const chartHeight = daily ? 330 : 290;

  return (
    <>
      <div className="chart-frame" role="img" aria-label={emptyMessage}>
        <div className="chart-scroll">
          <div className="chart-canvas" style={{ width: chartWidth, height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={chartRows} margin={{ top: 26, right: 18, left: 12, bottom: 10 }}>
                <CartesianGrid stroke="#d9e4e8" strokeDasharray="6 10" vertical={false} />
                <XAxis dataKey="label" axisLine={{ stroke: '#9fb3bd' }} tickLine={false} tick={{ fill: '#4b5d66', fontSize: 11, fontWeight: 800 }} />
                <YAxis
                  axisLine={{ stroke: '#9fb3bd' }}
                  tickLine={false}
                  tick={{ fill: '#60727c', fontSize: 11, fontWeight: 800 }}
                  tickFormatter={formatAxisNumber}
                  width={64}
                />
                <Tooltip content={<TooltipContent />} cursor={{ fill: 'rgba(17, 106, 117, 0.08)' }} />
                <Bar dataKey="value" name="Production" fill="#1398aa" radius={[7, 7, 0, 0]} barSize={daily ? 22 : 36}>
                  <LabelList dataKey="value" content={<ChartValueLabel />} />
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="chart-legend">
        <span><i className="legend-swatch production" />Production</span>
      </div>
      {!hasData ? <p className="chart-empty">{emptyMessage}</p> : null}
    </>
  );
}

function StackedPowerChart({ rows, zoomLevel, daily = false }) {
  const visibleRows = rows ?? [];
  const chartRows = visibleRows.map((row) => ({
    label: row.label,
    chlorinationPower: Number(row.chlorinationPower) || 0,
    deepwellPower: Number(row.deepwellPower) || 0,
    totalPower: Number(row.totalPower) || 0,
  }));
  const hasData = visibleRows.some((row) => Number(row.totalPower) > 0);
  const chartWidth = getChartWidth(chartRows.length, zoomLevel, daily);
  const chartHeight = daily ? 330 : 290;

  return (
    <>
      <div className="chart-frame" role="img" aria-label={daily ? 'Daily power consumption' : 'Monthly power consumption'}>
        <div className="chart-scroll">
          <div className="chart-canvas" style={{ width: chartWidth, height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={chartRows} margin={{ top: 30, right: 18, left: 12, bottom: 10 }}>
                <CartesianGrid stroke="#d9e4e8" strokeDasharray="6 10" vertical={false} />
                <XAxis dataKey="label" axisLine={{ stroke: '#9fb3bd' }} tickLine={false} tick={{ fill: '#4b5d66', fontSize: 11, fontWeight: 800 }} />
                <YAxis
                  axisLine={{ stroke: '#9fb3bd' }}
                  tickLine={false}
                  tick={{ fill: '#60727c', fontSize: 11, fontWeight: 800 }}
                  tickFormatter={formatAxisNumber}
                  width={64}
                />
                <Tooltip content={<TooltipContent />} cursor={{ fill: 'rgba(17, 106, 117, 0.08)' }} />
                <Legend wrapperStyle={{ display: 'none' }} />
                <Bar dataKey="chlorinationPower" name="Chlorination" stackId="power" fill="#149a8d" radius={[0, 0, 7, 7]} barSize={daily ? 22 : 36}>
                  <LabelList dataKey="chlorinationPower" content={<StackSegmentLabel fill="#149a8d" />} />
                </Bar>
                <Bar dataKey="deepwellPower" name="Deepwell" stackId="power" fill="#f59e0b" radius={[7, 7, 0, 0]} barSize={daily ? 22 : 36}>
                  <LabelList dataKey="deepwellPower" content={<StackSegmentLabel fill="#f59e0b" />} />
                  <LabelList dataKey="totalPower" content={<ChartValueLabel />} />
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="chart-legend">
        <span><i className="legend-swatch chlorination" />Chlorination</span>
        <span><i className="legend-swatch deepwell" />Deepwell</span>
      </div>
      {!hasData ? <p className="chart-empty">Monthly power consumption will appear after power values are saved.</p> : null}
    </>
  );
}

function formatDateTime(value) {
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

function getReadingTime(reading) {
  const parsed = new Date(reading?.reading_datetime || reading?.slot_datetime || reading?.created_at || '');
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function isReadingInDateRange(reading, range) {
  if (range === 'all') {
    return true;
  }

  const time = getReadingTime(reading);
  if (!time) {
    return false;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (range === 'today') {
    return time >= todayStart;
  }

  if (range === '24h') {
    return time >= now.getTime() - 24 * 60 * 60 * 1000;
  }

  if (range === '7d') {
    return time >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
  }

  return true;
}

function StackedChemicalChart({ rows, zoomLevel }) {
  const visibleRows = rows ?? [];
  const chartRows = visibleRows.map((row) => ({
    label: row.label,
    chlorineUsage: Number(row.chlorineUsage) || 0,
    peroxideUsage: Number(row.peroxideUsage) || 0,
    totalUsage: Number(row.totalUsage) || 0,
  }));
  const hasData = visibleRows.some((row) => Number(row.totalUsage) > 0);
  const chartWidth = getChartWidth(chartRows.length, zoomLevel);
  const chartHeight = 290;

  return (
    <>
      <div className="chart-frame" role="img" aria-label="Monthly chemical usage">
        <div className="chart-scroll">
          <div className="chart-canvas" style={{ width: chartWidth, height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={chartRows} margin={{ top: 30, right: 18, left: 12, bottom: 10 }}>
                <CartesianGrid stroke="#d9e4e8" strokeDasharray="6 10" vertical={false} />
                <XAxis dataKey="label" axisLine={{ stroke: '#9fb3bd' }} tickLine={false} tick={{ fill: '#4b5d66', fontSize: 11, fontWeight: 800 }} />
                <YAxis
                  axisLine={{ stroke: '#9fb3bd' }}
                  tickLine={false}
                  tick={{ fill: '#60727c', fontSize: 11, fontWeight: 800 }}
                  tickFormatter={formatAxisNumber}
                  width={64}
                />
                <Tooltip content={<TooltipContent />} cursor={{ fill: 'rgba(17, 106, 117, 0.08)' }} />
                <Legend wrapperStyle={{ display: 'none' }} />
                <Bar dataKey="chlorineUsage" name="Chlorine" stackId="chemical" fill="#0f8f7c" radius={[0, 0, 7, 7]} barSize={36}>
                  <LabelList dataKey="chlorineUsage" content={<StackSegmentLabel fill="#0f8f7c" />} />
                </Bar>
                <Bar dataKey="peroxideUsage" name="Peroxide" stackId="chemical" fill="#e7a321" radius={[7, 7, 0, 0]} barSize={36}>
                  <LabelList dataKey="peroxideUsage" content={<StackSegmentLabel fill="#e7a321" />} />
                  <LabelList dataKey="totalUsage" content={<ChartValueLabel />} />
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="chart-legend">
        <span><i className="legend-swatch chemical-chlorine" />Chlorine</span>
        <span><i className="legend-swatch chemical-peroxide" />Peroxide</span>
      </div>
      {!hasData ? <p className="chart-empty">Monthly chemical usage will appear after chlorine and peroxide values are saved.</p> : null}
    </>
  );
}

function RecentReadingCard({ reading }) {
  const isDeepwell = reading.site_type === 'DEEPWELL';
  const submittedBy = reading.submitted_profile?.full_name || reading.submitted_profile?.email || '-';
  const metricLabel = isDeepwell ? 'Power kWh' : 'Totalizer';
  const metricValue = isDeepwell ? (reading.power_kwh_shift ?? '-') : (reading.totalizer ?? '-');

  return (
    <article className={isDeepwell ? 'recent-reading-card deepwell' : 'recent-reading-card chlorination'}>
      <div className="recent-reading-topline">
        <div>
          <h4>{reading.site?.name || reading.sites?.name || (isDeepwell ? 'Deepwell reading' : 'Chlorination reading')}</h4>
          <span>{isDeepwell ? 'Deepwell' : 'Chlorination'}</span>
        </div>
        <strong>{reading.status || 'submitted'}</strong>
      </div>
      <div className="recent-reading-meta">
        <div>
          <span>Operator</span>
          <strong>{submittedBy}</strong>
        </div>
        <div>
          <span>Slot</span>
          <strong>{formatDateTime(reading.slot_datetime || reading.reading_datetime)}</strong>
        </div>
      </div>
      <p>Submitted: {formatDateTime(reading.reading_datetime || reading.created_at)}</p>
      <p>{metricLabel}: {metricValue}</p>
    </article>
  );
}

function RecentReadingsPanel({ readings }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const sortedReadings = [...(readings ?? [])].sort((a, b) => getReadingTime(b) - getReadingTime(a));
  const rangeReadings = sortedReadings.filter((reading) => isReadingInDateRange(reading, dateRange));
  const chlorinationReadings = rangeReadings.filter((reading) => reading.site_type === 'CHLORINATION');
  const deepwellReadings = rangeReadings.filter((reading) => reading.site_type === 'DEEPWELL');
  const displayReadings =
    typeFilter === 'all'
      ? Array.from({ length: Math.max(chlorinationReadings.length, deepwellReadings.length) }).flatMap((_, index) =>
          [chlorinationReadings[index], deepwellReadings[index]].filter(Boolean)
        )
      : rangeReadings.filter((reading) => reading.site_type === typeFilter);

  const typeOptions = [
    { key: 'all', label: 'All', icon: Grid3X3 },
    { key: 'CHLORINATION', label: 'Chlorination', icon: Droplets },
    { key: 'DEEPWELL', label: 'Deepwell', icon: Zap },
  ];
  const dateOptions = [
    { key: 'all', label: 'All time', icon: Clock },
    { key: 'today', label: 'Today', icon: CalendarDays },
    { key: '24h', label: 'Last 24h', icon: Hourglass },
    { key: '7d', label: 'Last 7 days', icon: CalendarDays },
  ];

  return (
    <section className="recent-readings-panel">
      <header className="recent-readings-heading">
        <span className="section-icon">
          <History size={16} />
        </span>
        <div>
          <h3>Recent readings</h3>
          <p>This account has readings-only office access.</p>
        </div>
      </header>

      <div className="recent-reading-filters">
        <div>
          <span>Sort by type</span>
          <div className="recent-chip-row">
            {typeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  type="button"
                  key={option.key}
                  className={typeFilter === option.key ? 'active' : ''}
                  onClick={() => setTypeFilter(option.key)}
                >
                  <Icon size={15} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span>Date range</span>
          <div className="recent-chip-row">
            {dateOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  type="button"
                  key={option.key}
                  className={dateRange === option.key ? 'active' : ''}
                  onClick={() => setDateRange(option.key)}
                >
                  <Icon size={15} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {displayReadings.length ? (
        <div className="recent-reading-scroll">
          <div className="recent-reading-grid">
            {displayReadings.map((reading) => (
              <RecentReadingCard key={`${reading.site_type}-${reading.id}`} reading={reading} />
            ))}
          </div>
        </div>
      ) : (
        <p className="chart-empty">No recent readings found for this filter.</p>
      )}
    </section>
  );
}

export default function OverviewScreen({ dashboard }) {
  const [powerZoom, setPowerZoom] = useState(1);
  const [chemicalZoom, setChemicalZoom] = useState(1);
  const [monthlyProductionZoom, setMonthlyProductionZoom] = useState(1);
  const [dailyProductionZoom, setDailyProductionZoom] = useState(1);
  const monthlyProduction = dashboard?.monthlyProduction ?? { totalProduction: 0, averageProduction: 0, rows: [] };
  const dailyProduction = dashboard?.dailyProduction ?? { monthLabel: '', totalProduction: 0, rows: [] };
  const monthlyPowerConsumption = dashboard?.monthlyPowerConsumption ?? { totalPower: 0, rows: [] };
  const monthlyChemicalUsage = dashboard?.monthlyChemicalUsage ?? { totalChlorine: 0, totalPeroxide: 0, rows: [] };
  const activeDailyRows = dailyProduction.rows.filter((row) => Number(row.production) > 0);
  const zoomProps = (zoomLevel, setZoomLevel) => ({
    zoomLevel,
    onZoomIn: () => setZoomLevel((current) => clampZoom(current + CHART_ZOOM_STEP)),
    onZoomOut: () => setZoomLevel((current) => clampZoom(current - CHART_ZOOM_STEP)),
    onReset: () => setZoomLevel(1),
  });

  return (
    <>
      <section className="chart-grid">
        <ChartPanel
          title="Monthly Production"
          icon={BarChart3}
          summaryLabel="Total Production"
          summaryValue={formatNumber(monthlyProduction.totalProduction)}
          summaryHint="Latest 10 months"
          {...zoomProps(monthlyProductionZoom, setMonthlyProductionZoom)}
        >
          <SimpleBarChart
            rows={monthlyProduction.rows}
            valueKey="production"
            emptyMessage="Monthly production will appear after readings with totalizer values are saved."
            zoomLevel={monthlyProductionZoom}
          />
        </ChartPanel>

        <ChartPanel
          title={`${dailyProduction.monthLabel || 'Current Month'} Production`}
          icon={CalendarDays}
          summaryLabel="Current Month"
          summaryValue={formatNumber(dailyProduction.totalProduction)}
          summaryHint={`${activeDailyRows.length} active day(s)`}
          {...zoomProps(dailyProductionZoom, setDailyProductionZoom)}
        >
          <SimpleBarChart
            rows={dailyProduction.rows}
            valueKey="production"
            emptyMessage="Daily production will appear after current-month totalizer values are saved."
            zoomLevel={dailyProductionZoom}
            daily
          />
        </ChartPanel>

        <ChartPanel
          title="Monthly Power Consumption"
          icon={Zap}
          summaryLabel="Total Power"
          summaryValue={formatNumber(monthlyPowerConsumption.totalPower)}
          summaryHint="Latest 10 months"
          {...zoomProps(powerZoom, setPowerZoom)}
        >
          <StackedPowerChart rows={monthlyPowerConsumption.rows} zoomLevel={powerZoom} />
        </ChartPanel>

        <ChartPanel
          title="Monthly Chemical Usage"
          icon={FlaskConical}
          summaryItems={[
            {
              label: 'Total Chlorine',
              value: formatNumber(monthlyChemicalUsage.totalChlorine),
              hint: 'Latest 10 months',
              icon: Droplets,
            },
            {
              label: 'Total Peroxide',
              value: formatNumber(monthlyChemicalUsage.totalPeroxide),
              hint: 'Latest 10 months',
              icon: FlaskConical,
            },
          ]}
          {...zoomProps(chemicalZoom, setChemicalZoom)}
        >
          <StackedChemicalChart rows={monthlyChemicalUsage.rows} zoomLevel={chemicalZoom} />
        </ChartPanel>
        <RecentReadingsPanel readings={dashboard?.recentReadings ?? []} />
      </section>
    </>
  );
}
