import { Activity, Clock3, ShieldCheck, Users } from 'lucide-react';
import ReadingsScreen from './ReadingsScreen';

function StatCard({ icon: Icon, label, value }) {
  return (
    <section className="stat-card">
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
      <span className="stat-icon">
        <Icon size={18} />
      </span>
    </section>
  );
}

export default function OverviewScreen({ dashboard }) {
  const stats = dashboard?.stats ?? {};

  return (
    <>
      <section className="stat-grid">
        <StatCard icon={Users} label="Total Operators" value={stats.totalOperators ?? 0} />
        <StatCard icon={ShieldCheck} label="Approved Operators" value={stats.approvedOperators ?? 0} />
        <StatCard icon={Clock3} label="Pending Approval" value={stats.pendingOperators ?? 0} />
        <StatCard icon={Activity} label="Today Readings" value={stats.todayReadings ?? 0} />
      </section>

      <ReadingsScreen
        title="Recent Readings"
        meta={`${stats.totalSites ?? 0} sites`}
        readings={dashboard?.recentReadings ?? []}
      />
    </>
  );
}
