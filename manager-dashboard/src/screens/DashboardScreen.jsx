import { BarChart3, CheckCircle2, Droplets, Loader2, LogOut, RefreshCw, Users } from 'lucide-react';
import AccountsScreen from './AccountsScreen';
import ApprovalsScreen from './ApprovalsScreen';
import OverviewScreen from './OverviewScreen';
import ReadingsScreen from './ReadingsScreen';

function titleize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : 'Dashboard';
}

function getTabs(isAdmin) {
  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'readings', label: 'Readings', icon: Droplets },
  ];

  if (isAdmin) {
    tabs.push({ key: 'approvals', label: 'Approvals', icon: CheckCircle2 });
    tabs.push({ key: 'accounts', label: 'Accounts', icon: Users });
  }

  return tabs;
}

export default function DashboardScreen({
  activeView,
  dashboard,
  isAdmin,
  loading,
  message,
  profile,
  workingId,
  onApprove,
  onNavigate,
  onRefresh,
  onRoleChange,
  onSignOut,
}) {
  const tabs = getTabs(isAdmin);
  const recentReadings = dashboard?.recentReadings ?? [];

  function renderActiveView() {
    if (activeView === 'readings') {
      return <ReadingsScreen readings={recentReadings} />;
    }

    if (activeView === 'approvals' && isAdmin) {
      return (
        <ApprovalsScreen
          approvals={dashboard?.pendingApprovals ?? []}
          workingId={workingId}
          onApprove={onApprove}
        />
      );
    }

    if (activeView === 'accounts' && isAdmin) {
      return (
        <AccountsScreen
          accounts={dashboard?.profiles ?? []}
          workingId={workingId}
          onRoleChange={onRoleChange}
        />
      );
    }

    return <OverviewScreen dashboard={dashboard} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup compact">
          <span className="brand-mark">NX</span>
          <div>
            <h1>NemeXus</h1>
            <p>{profile?.role || 'dashboard'}</p>
          </div>
        </div>

        <nav className="tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={activeView === tab.key ? 'active' : ''}
                type="button"
                onClick={() => onNavigate(tab.key)}
              >
                <Icon size={17} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <button className="secondary-button" type="button" onClick={onSignOut}>
          <LogOut size={16} />
          Sign out
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Live Supabase workspace</p>
            <h2>{titleize(activeView)}</h2>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </header>

        {message ? <div className="notice">{message}</div> : null}
        {renderActiveView()}
      </section>
    </main>
  );
}
