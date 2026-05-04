import { useState } from 'react';
import { Activity, BarChart3, CalendarDays, Factory, Gauge, Minus, Plus, RotateCcw, Zap } from 'lucide-react';
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
        <div className="summary-pill">
          <strong>{summaryValue}</strong>
          <span>{summaryLabel}</span>
          {summaryHint ? <small>{summaryHint}</small> : null}
        </div>
        <ZoomControls zoomLevel={zoomLevel} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onReset} />
      </header>
      {children}
    </section>
  );
}

function chartScaleStyle(zoomLevel, daily = false) {
  const baseColumnWidth = daily ? 42 : 58;
  const baseBarWidth = daily ? 20 : 34;
  const baseGap = daily ? 10 : 12;

  return {
    '--chart-column-width': `${Math.round(baseColumnWidth * zoomLevel)}px`,
    '--chart-bar-width': `${Math.round(baseBarWidth * zoomLevel)}px`,
    '--chart-gap': `${Math.round(baseGap * zoomLevel)}px`,
  };
}

function SimpleBarChart({ rows, valueKey, emptyMessage, zoomLevel, daily = false }) {
  const visibleRows = [...(rows ?? [])].reverse();
  const maxValue = Math.max(...visibleRows.map((row) => Number(row[valueKey]) || 0), 1);
  const hasData = visibleRows.some((row) => Number(row[valueKey]) > 0);

  return (
    <>
      <div className={`bar-chart${daily ? ' daily' : ''}`} role="img" aria-label={emptyMessage} style={chartScaleStyle(zoomLevel, daily)}>
        {visibleRows.map((row) => {
          const value = Number(row[valueKey]) || 0;
          const height = Math.max(3, Math.round((value / maxValue) * 100));

          return (
            <div className="bar-column" key={row.key || row.label}>
              <span className="bar-value">{value > 0 ? formatNumber(value) : ''}</span>
              <div className="bar-track">
                <span className="bar-fill" style={{ height: `${height}%` }} />
              </div>
              <span className="bar-label">{row.label}</span>
            </div>
          );
        })}
      </div>
      {!hasData ? <p className="chart-empty">{emptyMessage}</p> : null}
    </>
  );
}

function StackedPowerChart({ rows, zoomLevel, daily = false }) {
  const visibleRows = [...(rows ?? [])].reverse();
  const maxValue = Math.max(...visibleRows.map((row) => Number(row.totalPower) || 0), 1);
  const hasData = visibleRows.some((row) => Number(row.totalPower) > 0);

  return (
    <>
      <div
        className={`bar-chart stacked${daily ? ' daily' : ''}`}
        role="img"
        aria-label={daily ? 'Daily power consumption' : 'Monthly power consumption'}
        style={chartScaleStyle(zoomLevel, daily)}
      >
        {visibleRows.map((row) => {
          const chlorinationPower = Number(row.chlorinationPower) || 0;
          const deepwellPower = Number(row.deepwellPower) || 0;
          const totalPower = Number(row.totalPower) || chlorinationPower + deepwellPower;
          const totalHeight = Math.max(3, Math.round((totalPower / maxValue) * 100));
          const chlorinationShare = totalPower ? (chlorinationPower / totalPower) * 100 : 0;
          const deepwellShare = totalPower ? (deepwellPower / totalPower) * 100 : 0;

          return (
            <div className="bar-column" key={row.key || row.label}>
              <span className="bar-value">{totalPower > 0 ? formatNumber(totalPower) : ''}</span>
              <div className="bar-track">
                <span className="stack-fill" style={{ height: `${totalHeight}%` }}>
                  <span className="stack-segment chlorination" style={{ height: `${chlorinationShare}%` }} />
                  <span className="stack-segment deepwell" style={{ height: `${deepwellShare}%` }} />
                </span>
              </div>
              <span className="bar-label">{row.label}</span>
            </div>
          );
        })}
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
          title={`${dailyPowerConsumption.monthLabel || 'Current Month'} Power Consumption`}
          icon={Zap}
          summaryLabel="Current Month Power"
          summaryValue={formatNumber(dailyPowerConsumption.totalPower)}
          summaryHint={`${activeDailyPowerRows.length} active day(s)`}
          {...zoomProps(dailyPowerZoom, setDailyPowerZoom)}
        >
          <StackedPowerChart rows={dailyPowerConsumption.rows} zoomLevel={dailyPowerZoom} daily />
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
