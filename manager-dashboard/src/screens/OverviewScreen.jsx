import { Activity, BarChart3, CalendarDays, Factory, Gauge, Zap } from 'lucide-react';
import ReadingsScreen from './ReadingsScreen';

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

function ChartPanel({ title, icon: Icon, summaryLabel, summaryValue, summaryHint, children }) {
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
      </header>
      {children}
    </section>
  );
}

function SimpleBarChart({ rows, valueKey, emptyMessage }) {
  const visibleRows = [...(rows ?? [])].reverse();
  const maxValue = Math.max(...visibleRows.map((row) => Number(row[valueKey]) || 0), 1);
  const hasData = visibleRows.some((row) => Number(row[valueKey]) > 0);

  return (
    <>
      <div className="bar-chart" role="img" aria-label={emptyMessage}>
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

function StackedPowerChart({ rows }) {
  const visibleRows = [...(rows ?? [])].reverse();
  const maxValue = Math.max(...visibleRows.map((row) => Number(row.totalPower) || 0), 1);
  const hasData = visibleRows.some((row) => Number(row.totalPower) > 0);

  return (
    <>
      <div className="bar-chart stacked" role="img" aria-label="Monthly power consumption">
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
  const stats = dashboard?.stats ?? {};
  const monthlyProduction = dashboard?.monthlyProduction ?? { totalProduction: 0, averageProduction: 0, rows: [] };
  const dailyProduction = dashboard?.dailyProduction ?? { monthLabel: '', totalProduction: 0, rows: [] };
  const monthlyPowerConsumption = dashboard?.monthlyPowerConsumption ?? { totalPower: 0, rows: [] };
  const activeDailyRows = dailyProduction.rows.filter((row) => Number(row.production) > 0);
  const latestPower = monthlyPowerConsumption.rows[0]?.totalPower ?? 0;

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
        >
          <StackedPowerChart rows={monthlyPowerConsumption.rows} />
        </ChartPanel>

        <ChartPanel
          title="Monthly Production"
          icon={BarChart3}
          summaryLabel="Total Production"
          summaryValue={formatNumber(monthlyProduction.totalProduction)}
          summaryHint="Latest 10 months"
        >
          <SimpleBarChart
            rows={monthlyProduction.rows}
            valueKey="production"
            emptyMessage="Monthly production will appear after readings with totalizer values are saved."
          />
        </ChartPanel>

        <ChartPanel
          title={`${dailyProduction.monthLabel || 'Current Month'} Production`}
          icon={Gauge}
          summaryLabel="Current Month"
          summaryValue={formatNumber(dailyProduction.totalProduction)}
          summaryHint={`${activeDailyRows.length} active day(s)`}
        >
          <SimpleBarChart
            rows={dailyProduction.rows}
            valueKey="production"
            emptyMessage="Daily production will appear after current-month totalizer values are saved."
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
