import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

export default function LoginScreen({ message, onMessage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    onMessage('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      onMessage(error.message || 'Sign in failed.');
    }

    setBusy(false);
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <BrandLockup title="NemeXus Dashboard" subtitle="Manager and supervisor access" />

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {message ? <p className="form-message">{message}</p> : null}

          <button type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />}
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
