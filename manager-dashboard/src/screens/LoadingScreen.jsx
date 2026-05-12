const summaryCards = ['Operators', 'Approved', 'Pending', 'Sites', 'Readings'];
const chartPanels = ['Production', 'Daily', 'Power', 'Chemical'];
const tableRows = Array.from({ length: 8 }, (_, index) => index);

function SkeletonBlock({ className = '' }) {
  return <span className={`skeleton-block ${className}`} aria-hidden="true" />;
}

function LoadingTopbar({ activeView }) {
  return (
    <header className="loading-topbar">
      <div>
        <SkeletonBlock className="loading-line eyebrow" />
        <SkeletonBlock className={activeView === 'readings' ? 'loading-line heading readings' : 'loading-line heading'} />
      </div>
      <div className="loading-pills">
        <SkeletonBlock className="loading-pill" />
        <SkeletonBlock className="loading-pill compact" />
      </div>
    </header>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <section className="loading-overview-grid">
        <div className="loading-panel">
          <div className="loading-panel-heading">
            <SkeletonBlock className="loading-icon" />
            <div>
              <SkeletonBlock className="loading-line heading small" />
              <SkeletonBlock className="loading-line medium" />
            </div>
          </div>
          <div className="loading-summary-grid">
            {summaryCards.map((item) => (
              <div className="loading-summary-card" key={item}>
                <SkeletonBlock className="loading-line tiny" />
                <SkeletonBlock className="loading-number" />
              </div>
            ))}
          </div>
        </div>

        <div className="loading-panel">
          <div className="loading-panel-heading">
            <SkeletonBlock className="loading-icon" />
            <div>
              <SkeletonBlock className="loading-line heading small" />
              <SkeletonBlock className="loading-line medium" />
            </div>
          </div>
          <div className="loading-alert-list">
            <SkeletonBlock className="loading-alert critical" />
            <SkeletonBlock className="loading-alert warning" />
            <SkeletonBlock className="loading-alert peek" />
          </div>
        </div>
      </section>

      <section className="loading-chart-grid">
        {chartPanels.map((item) => (
          <div className="loading-panel loading-chart-panel" key={item}>
            <div className="loading-panel-heading">
              <SkeletonBlock className="loading-icon" />
              <SkeletonBlock className="loading-line heading small" />
            </div>
            <div className="loading-chart">
              <SkeletonBlock className="loading-chart-bar small" />
              <SkeletonBlock className="loading-chart-bar tall" />
              <SkeletonBlock className="loading-chart-bar mid" />
              <SkeletonBlock className="loading-chart-bar tall" />
              <SkeletonBlock className="loading-chart-bar small" />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function ReadingsSkeleton() {
  return (
    <>
      <section className="loading-panel loading-filter-panel">
        <div className="loading-panel-heading">
          <SkeletonBlock className="loading-icon" />
          <SkeletonBlock className="loading-line heading small" />
        </div>
        <div className="loading-filter-grid">
          <SkeletonBlock className="loading-filter-wide" />
          <SkeletonBlock className="loading-field" />
          <SkeletonBlock className="loading-field" />
          <SkeletonBlock className="loading-field" />
          <SkeletonBlock className="loading-field" />
          <SkeletonBlock className="loading-filter-wide" />
          <SkeletonBlock className="loading-button-line" />
        </div>
      </section>

      <section className="loading-panel loading-table-panel">
        <div className="loading-table-head">
          <SkeletonBlock className="loading-line heading small" />
          <SkeletonBlock className="loading-pill compact" />
        </div>
        <div className="loading-table">
          <div className="loading-table-row header">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <SkeletonBlock className="loading-table-cell" key={item} />
            ))}
          </div>
          {tableRows.map((row) => (
            <div className="loading-table-row" key={row}>
              {[0, 1, 2, 3, 4, 5].map((cell) => (
                <SkeletonBlock className={cell === 2 ? 'loading-table-cell wide' : 'loading-table-cell'} key={cell} />
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function LoadingScreen({ activeView = 'dashboard', themeMode = 'dark' }) {
  const isReadings = activeView === 'readings';

  return (
    <main className={`loading-shell ${themeMode === 'dark' ? 'dark-mode' : 'light-mode'}`} aria-label="Loading dashboard">
      <span className="loading-menu-button" aria-hidden="true" />
      <section className="loading-content">
        <LoadingTopbar activeView={activeView} />
        {isReadings ? <ReadingsSkeleton /> : <DashboardSkeleton />}
      </section>
    </main>
  );
}
