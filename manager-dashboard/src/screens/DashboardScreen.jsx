import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Droplets,
  FlaskConical,
  History,
  Loader2,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  Users,
  Zap,
} from 'lucide-react';
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

const DASHBOARD_SECTIONS = [
  { key: 'production', label: 'Production', icon: BarChart3 },
  { key: 'power', label: 'Power', icon: Zap },
  { key: 'chemical', label: 'Chemical', icon: FlaskConical },
  { key: 'activity', label: 'Operators & Recent', icon: History },
];

export default function DashboardScreen({
  activeView,
  dashboard,
  isAdmin,
  loading,
  message,
  profile,
  themeMode,
  workingId,
  onApprove,
  onNavigate,
  onRefresh,
  onRoleChange,
  onSignOut,
  onThemeToggle,
}) {
  const tabs = getTabs(isAdmin);
  const recentReadings = dashboard?.recentReadings ?? [];
  const [readingType, setReadingType] = useState('CHLORINATION');
  const [dashboardSection, setDashboardSection] = useState('production');
  const [isBrandMenuOpen, setIsBrandMenuOpen] = useState(false);
  const brandMenuRef = useRef(null);
  const isDarkMode = themeMode === 'dark';

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!brandMenuRef.current?.contains(event.target)) {
        setIsBrandMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  function renderActiveView() {
    if (activeView === 'readings') {
      return (
        <ReadingsScreen
          readings={recentReadings}
          selectedTableMode={readingType}
        />
      );
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

    return <OverviewScreen dashboard={dashboard} activeSection={dashboardSection} />;
  }

  function handleDashboardSectionSelect(sectionKey) {
    setDashboardSection(sectionKey);
    onNavigate('dashboard');
  }

  return (
    <main className={`app-shell ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <aside className="sidebar">
        <div className="brand-menu-wrap" ref={brandMenuRef}>
          <button
            className="brand-lockup compact brand-menu-trigger"
            type="button"
            aria-expanded={isBrandMenuOpen}
            aria-label="Open account menu"
            onClick={() => setIsBrandMenuOpen((isOpen) => !isOpen)}
          >
            <span className="brand-mark">
              <img src="/nemexus-logo.png" alt="NemeXus logo" />
            </span>
            <span className="brand-copy">
              <span className="brand-title-row">
                <h1>NemeXus</h1>
                <ChevronDown size={16} />
              </span>
              <p>{profile?.email || 'user@example.com'}</p>
              <p>{profile?.role || 'dashboard'}</p>
            </span>
          </button>

          {isBrandMenuOpen ? (
            <div className="brand-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={onThemeToggle}
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                {isDarkMode ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={onSignOut}
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          ) : null}
        </div>

        <nav className="tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <div className="tab-group" key={tab.key}>
                <button
                  className={activeView === tab.key ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    if (tab.key === 'dashboard') {
                      handleDashboardSectionSelect('production');
                      return;
                    }

                    onNavigate(tab.key);
                  }}
                >
                  <Icon size={17} />
                  {tab.label}
                </button>
                {tab.key === 'dashboard' && activeView === 'dashboard' ? (
                  <div className="tabs-subnav dashboard-subnav">
                    {DASHBOARD_SECTIONS.map((section) => {
                      const SectionIcon = section.icon;
                      return (
                        <button
                          type="button"
                          key={section.key}
                          className={dashboardSection === section.key ? 'active' : ''}
                          onClick={() => handleDashboardSectionSelect(section.key)}
                        >
                          <SectionIcon size={14} />
                          {section.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {tab.key === 'readings' && activeView === 'readings' ? (
                  <div className="tabs-subnav">
                    <button
                      type="button"
                      className={readingType === 'CHLORINATION' ? 'active' : ''}
                      onClick={() => setReadingType('CHLORINATION')}
                    >
                      Chlorination
                    </button>
                    <button
                      type="button"
                      className={readingType === 'DEEPWELL' ? 'active' : ''}
                      onClick={() => setReadingType('DEEPWELL')}
                    >
                      Deepwell
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
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
