import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';

async function googleEnabled(): Promise<boolean> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const s = await r.json();
    return Boolean(s?.external?.google);
  } catch { return true; }   // if the check itself fails, let Supabase decide
}

export function Auth() {
  const { t } = useI18n();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  // Google sign-in goes through Supabase Auth: Google -> Supabase callback -> back to this page with a session.
  const google = async () => {
    setBusy(true); setMsg(null);
    // Supabase answers a disabled provider with a bare error page, so check its public settings first.
    if (!(await googleEnabled())) { setMsg({ kind: 'error', text: t('google_not_enabled') }); setBusy(false); return; }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } },
    });
    if (error) {
      setMsg({ kind: 'error', text: /provider is not enabled|unsupported provider/i.test(error.message) ? t('google_not_enabled') : error.message });
      setBusy(false);
    }
    // On success the browser leaves for Google; nothing else to do here.
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ kind: 'error', text: error.message });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } });
      if (error) setMsg({ kind: 'error', text: error.message });
      else if (!data.session) setMsg({ kind: 'info', text: t('check_email') });
    }
    setBusy(false);
  };

  return (
    <div className="content" style={{ maxWidth: 420, margin: '8vh auto 0', width: '100%' }}>
      <h1>{t('app_title')}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{mode === 'in' ? t('sign_in') : t('sign_up')}</p>
      <button className="btn block" type="button" onClick={google} disabled={busy} style={{ marginTop: 20 }}>
        {t('google')}
      </button>
      <div className="or"><span>{t('or_email')}</span></div>
      <form onSubmit={submit}>
        {mode === 'up' && (
          <div className="field"><label htmlFor="name">{t('display_name')}</label>
            <input id="name" className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></div>
        )}
        <div className="field"><label htmlFor="email">{t('email')}</label>
          <input id="email" className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></div>
        <div className="field"><label htmlFor="password">{t('password')}</label>
          <input id="password" className="input" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></div>
        {msg && <div className={msg.kind === 'error' ? 'error' : 'card small'} role="status">{msg.text}</div>}
        <button className="btn primary block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
          {mode === 'in' ? t('sign_in') : t('sign_up')}
        </button>
      </form>
      <button className="link" type="button" style={{ marginTop: 12 }} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
        {mode === 'in' ? t('no_account') : t('have_account')}
      </button>
    </div>
  );
}
