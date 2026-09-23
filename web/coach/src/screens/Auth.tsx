import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';

// Coaches sign in with the same accounts as athletes; the role decides what they see.
export function Auth() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <main className="content" style={{ maxWidth: 380, margin: '0 auto' }}>
      <h1>{t('sign_in')}</h1>
      <button className="btn block" type="button" style={{ marginBottom: 14 }}
        onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } })}>
        {t('google')}
      </button>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="e">{t('email')}</label>
          <input id="e" className="input" type="email" autoComplete="email" value={email} onChange={ev => setEmail(ev.target.value)} required /></div>
        <div className="field"><label htmlFor="p">{t('password')}</label>
          <input id="p" className="input" type="password" autoComplete="current-password" value={password} onChange={ev => setPassword(ev.target.value)} required /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary block" type="submit" disabled={busy}>{busy ? '…' : t('sign_in')}</button>
      </form>
    </main>
  );
}
