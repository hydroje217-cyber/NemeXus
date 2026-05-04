function BrandLockup({ title, subtitle }) {
  return (
    <div className="brand-lockup">
      <span className="brand-mark">NX</span>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

export default function SupabaseMissingScreen() {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <BrandLockup
          title="Supabase Setup Needed"
          subtitle="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to manager-dashboard/.env."
        />
      </section>
    </main>
  );
}
