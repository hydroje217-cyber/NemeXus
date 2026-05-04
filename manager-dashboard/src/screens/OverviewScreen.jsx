import { useState } from 'react';
import { Activity, BarChart3, CalendarDays, Factory, Gauge, Minus, Plus, RotateCcw, Zap } from 'lucide-react';
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
import ReadingsScreen from './ReadingsScreen';

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

function MetricCard({ icon: Icon, label, value, detail }) {
  return (
    <section className="metric-card">
      <div className="metric-heading">
        <span className="metric-icon">
          <Icon size={17} />
        </span>
        <p>{label}</p>
      </div>
      <div>
        <strong>{value}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
    </section>
  );
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

function ChartPanel({ title, icon: Icon, summaryLabel, summaryValue, summaryHint, zoomLevel, onZoomIn, onZoomOut, onReset, children }) {
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
      <div className="summary-pill">
        <span className="summary-icon">
          <Icon size={18} />
        </span>
        <div>
          <span>{summaryLabel}</span>
          <strong>{summaryValue}</strong>
          {summaryHint ? <small>{summaryHint}</small> : null}
        </div>
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

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
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
  const visibleRows = [...(rows ?? [])].reverse();
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
  const visibleRows = [...(rows ?? [])].reverse();
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

export default function OverviewScreen({ dashboard }) {
  const [powerZoom, setPowerZoom] = useState(1);
  const [monthlyProductionZoom, setMonthlyProductionZoom] = useState(1);
  const [dailyProductionZoom, setDailyProductionZoom] = useState(1);
  const [dailyPowerZoom, setDailyPowerZoom] = useState(1);
  const stats = dashboard?.stats ?? {};
  const monthlyProduction = dashboard?.monthlyProduction ?? { totalProduction: 0, averageProduction: 0, rows: [] };
  const dailyProduction = dashboard?.dailyProduction ?? { monthLabel: '', totalProduction: 0, rows: [] };
  const monthlyPowerConsumption = dashboard?.monthlyPowerConsumption ?? { totalPower: 0, rows: [] };
  const dailyPowerConsumption = dashboard?.dailyPowerConsumption ?? { monthLabel: '', totalPower: 0, rows: [] };
  const activeDailyRows = dailyProduction.rows.filter((row) => Number(row.production) > 0);
  const activeDailyPowerRows = dailyPowerConsumption.rows.filter((row) => Number(row.totalPower) > 0);
  const latestPower = monthlyPowerConsumption.rows[0]?.totalPower ?? 0;
  const zoomProps = (zoomLevel, setZoomLevel) => ({
    zoomLevel,
    onZoomIn: () => setZoomLevel((current) => clampZoom(current + CHART_ZOOM_STEP)),
    onZoomOut: () => setZoomLevel((current) => clampZoom(current - CHART_ZOOM_STEP)),
    onReset: () => setZoomLevel(1),
  });

  return (
    <>
      <section className="metric-grid">
        <MetricCard
          icon={Factory}
          label="10-month production"
          value={formatNumber(monthlyProduction.totalProduction)}
          detail={`Avg ${formatNumber(monthlyProduction.averageProduction)}`}
        />
        <MetricCard
          icon={Zap}
          label="10-month power"
          value={formatNumber(monthlyPowerConsumption.totalPower)}
          detail={`Latest ${formatNumber(latestPower)}`}
        />
        <MetricCard
          icon={CalendarDays}
          label="Current month"
          value={formatNumber(dailyProduction.totalProduction)}
          detail={`${activeDailyRows.length} active day(s)`}
        />
        <MetricCard
          icon={Zap}
          label="Current month power"
          value={formatNumber(dailyPowerConsumption.totalPower)}
          detail={`${activeDailyPowerRows.length} active day(s)`}
        />
        <MetricCard
          icon={Activity}
          label="Readings today"
          value={stats.todayReadings ?? 0}
          detail={`${dashboard?.recentReadings?.length ?? 0} recent loaded`}
        />
      </section>

      <section className="chart-grid">
        <ChartPanel
          title={`${dailyPowerConsumption.monthLabel || 'Current Month'} Power Consumption`}
          icon={Zap}
          summaryLabel="Current Month Power"
          summaryValue={formatNumber(dailyPowerConsumption.totalPower)}
          summaryHint={`${activeDailyPowerRows.length} active day(s)`}
          {...zoomProps(dailyPowerZoom, setDailyPowerZoom)}
        >
          <StackedPowerChart rows={dailyPowerConsumption.rows} zoomLevel={dailyPowerZoom} daily />
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
          title={`${dailyProduction.monthLabel || 'Current Month'} Production`}
          icon={Gauge}
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
      </section>

      <ReadingsScreen
        title="Recent Readings"
        meta={`${stats.totalSites ?? 0} sites`}
        readings={dashboard?.recentReadings ?? []}
      />
    </>
  );
}
