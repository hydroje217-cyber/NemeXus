import { LogOut } from 'lucide-react';

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

export default function AccessRequiredScreen({ onSignOut }) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <BrandLockup
          title="Dashboard Access Required"
          subtitle="This web dashboard is only for manager, supervisor, and admin accounts."
        />
        <button className="secondary-button" type="button" onClick={onSignOut}>
          <LogOut size={16} />
          Sign out
        </button>
      </section>
    </main>
  );
}
