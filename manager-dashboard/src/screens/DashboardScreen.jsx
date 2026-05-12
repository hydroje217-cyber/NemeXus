import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Droplets,
  FlaskConical,
  History,
  Loader2,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Sun,
  Users,
  X,
  Zap,
} from 'lucide-react';
import AccountsScreen from './AccountsScreen';
import ApprovalsScreen from './ApprovalsScreen';
import OverviewScreen, { buildOperationAlerts } from './OverviewScreen';
import ReadingsScreen from './ReadingsScreen';

function titleize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : 'Dashboard';
}

function formatLastUpdated(value) {
  if (!value) {
    return 'Waiting for data';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Recently updated';
  }

  return `Updated ${parsed.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
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

const DASHBOARD_SECTION_GROUPS = [
  {
    label: 'Overview',
    sections: [
      { key: 'summary', label: 'Live Summary', icon: Zap },
      { key: 'operations', label: 'Operations', icon: AlertTriangle },
    ],
  },
  {
    label: 'Analytics',
    sections: [
      { key: 'production', label: 'Production', icon: BarChart3 },
      { key: 'power', label: 'Power', icon: Zap },
      { key: 'chemical', label: 'Chemical', icon: FlaskConical },
    ],
  },
  {
    label: 'Activity',
    sections: [
      { key: 'activity', label: 'Operators & Recent', icon: History },
    ],
  },
];

export default function DashboardScreen({
  activeView,
  dashboard,
  isAdmin,
  lastUpdatedAt,
  loading,
  message,
  profile,
  themeMode,
  workingId,
  onApprove,
  onNavigate,
  onRefresh,
  onRoleChange,
  onDeleteAccount,
  onSignOut,
  onThemeToggle,
}) {
  const tabs = getTabs(isAdmin);
  const recentReadings = dashboard?.recentReadings ?? [];
  const operationAlertCount = buildOperationAlerts(dashboard).length;
  const [readingType, setReadingType] = useState('CHLORINATION');
  const [dashboardSection, setDashboardSection] = useState('summary');
  const [visibleDashboardSections, setVisibleDashboardSections] = useState(['summary']);
  const [dashboardScrollRequest, setDashboardScrollRequest] = useState(0);
  const [isBrandMenuOpen, setIsBrandMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [openSubnav, setOpenSubnav] = useState('dashboard');
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

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 520);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
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
          currentProfileId={profile?.id}
          workingId={workingId}
          onRoleChange={onRoleChange}
          onDeleteAccount={onDeleteAccount}
        />
      );
    }

    return (
      <OverviewScreen
        dashboard={dashboard}
        isAdmin={isAdmin}
        activeSection={dashboardSection}
        scrollRequest={dashboardScrollRequest}
        onVisibleSectionsChange={setVisibleDashboardSections}
        onOpenApprovals={() => {
          onNavigate('approvals');
          setOpenSubnav('');
          setIsSidebarOpen(false);
        }}
      />
    );
  }

  function handleDashboardSectionSelect(sectionKey) {
    setDashboardSection(sectionKey);
    setVisibleDashboardSections([sectionKey]);
    setDashboardScrollRequest((requestId) => requestId + 1);
    onNavigate('dashboard');
    setIsSidebarOpen(false);
    setIsBrandMenuOpen(false);
  }

  function handleReadingTypeSelect(nextReadingType) {
    setReadingType(nextReadingType);
    setIsSidebarOpen(false);
    setIsBrandMenuOpen(false);
  }

  function handleTabSelect(tabKey) {
    const hasSubnav = tabKey === 'dashboard' || tabKey === 'readings';

    if (hasSubnav && activeView === tabKey) {
      setOpenSubnav((currentSubnav) => (currentSubnav === tabKey ? '' : tabKey));
      return;
    }

    if (tabKey === 'dashboard') {
      setDashboardSection('summary');
      setVisibleDashboardSections(['summary']);
      setDashboardScrollRequest((requestId) => requestId + 1);
    }

    onNavigate(tabKey);
    setOpenSubnav(hasSubnav ? tabKey : '');
    setIsBrandMenuOpen(false);

    if (!hasSubnav) {
      setIsSidebarOpen(false);
    }
  }

  function handleScrollTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className={`app-shell ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <button
        className="sidebar-toggle-button"
        type="button"
        aria-label={isSidebarOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={isSidebarOpen}
        onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
      >
        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {isSidebarOpen ? (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => {
            setIsSidebarOpen(false);
            setIsBrandMenuOpen(false);
          }}
        />
      ) : null}

      <aside className={isSidebarOpen ? 'sidebar is-open' : 'sidebar'} aria-hidden={!isSidebarOpen}>
        <div className="sidebar-mobile-head">
          <div
            className={isBrandMenuOpen ? 'brand-menu-wrap menu-open' : 'brand-menu-wrap'}
            ref={brandMenuRef}
          >
            <button
              className="brand-lockup compact brand-menu-trigger"
              type="button"
              aria-expanded={isBrandMenuOpen}
              aria-label="Open account menu"
              onClick={() => {
                setIsBrandMenuOpen((isOpen) => !isOpen);
              }}
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

          <button
            className="mobile-menu-button"
            type="button"
            aria-label="Close navigation"
            onClick={() => {
              setIsSidebarOpen(false);
              setIsBrandMenuOpen(false);
            }}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <div className="tab-group" key={tab.key}>
                <button
                  className={activeView === tab.key ? 'active' : ''}
                  type="button"
                  onClick={() => handleTabSelect(tab.key)}
                >
                  <Icon size={17} />
                  {tab.label}
                </button>
                {tab.key === 'dashboard' && activeView === 'dashboard' && openSubnav === 'dashboard' ? (
                  <div className="tabs-subnav dashboard-subnav">
                    {DASHBOARD_SECTION_GROUPS.map((group) => (
                      <div className="dashboard-subnav-group" key={group.label}>
                        <span className="dashboard-subnav-label">{group.label}</span>
                        {group.sections.map((section) => {
                          const SectionIcon = section.icon;
                          return (
                            <button
                              type="button"
                              key={section.key}
                              className={visibleDashboardSections.includes(section.key) ? 'active' : ''}
                              onClick={() => handleDashboardSectionSelect(section.key)}
                            >
                              <SectionIcon size={14} />
                              {section.label}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : null}
                {tab.key === 'readings' && activeView === 'readings' && openSubnav === 'readings' ? (
                  <div className="tabs-subnav">
                    <button
                      type="button"
                      className={readingType === 'CHLORINATION' ? 'active' : ''}
                      onClick={() => handleReadingTypeSelect('CHLORINATION')}
                    >
                      Chlorination
                    </button>
                    <button
                      type="button"
                      className={readingType === 'DEEPWELL' ? 'active' : ''}
                      onClick={() => handleReadingTypeSelect('DEEPWELL')}
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
            <div className="topbar-title-row">
              <button
                className="topbar-menu-button"
                type="button"
                aria-label="Open navigation"
                aria-expanded={isSidebarOpen}
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu size={20} />
              </button>
              <div className="topbar-title-copy">
                <p className="eyebrow">Live Supabase workspace</p>
                <h2>{titleize(activeView)}</h2>
              </div>
              <button className="mobile-title-refresh" type="button" aria-label="Refresh dashboard" onClick={onRefresh} disabled={loading}>
                {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              </button>
            </div>
          </div>
          <div className="topbar-status-row">
            <div className="status-strip" aria-label="Workspace status">
              <span className="status-pill connected">
                <CheckCircle2 size={14} />
                Connected
              </span>
              <span className={operationAlertCount ? 'status-pill warning' : 'status-pill connected'}>
                <AlertTriangle size={14} />
                {operationAlertCount} alerts
              </span>
            </div>
            <div className="topbar-actions">
              <span className="freshness-pill">
                <span aria-hidden="true" />
                {formatLastUpdated(lastUpdatedAt)}
              </span>
              <button className="refresh-button" type="button" onClick={onRefresh} disabled={loading}>
                {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                <span className="refresh-button-label">Refresh</span>
              </button>
            </div>
          </div>
        </header>

        {message ? <div className="notice">{message}</div> : null}
        {renderActiveView()}
      </section>

      <button
        className={showScrollTop ? 'scroll-top-button visible' : 'scroll-top-button'}
        type="button"
        aria-label="Scroll to top"
        onClick={handleScrollTop}
      >
        <ArrowUp size={22} />
      </button>
    </main>
  );
}
