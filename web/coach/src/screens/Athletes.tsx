import { useState } from 'react';
import { addAthlete, loadAthletes } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { useLoad } from '../lib/useLoad';
import { Failed, Loading } from '../components/Status';

export function Athletes() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(loadAthletes, []);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { await addAthlete(email); setEmail(''); setMsg(t('athlete_added')); reload(); }
    catch (err) { setMsg((err as { message?: string }).message || t('failed')); }
    setBusy(false);
  };

  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  return (
    <>
      <h1>{t('athletes')}</h1>
      <p className="muted">{t('athletes_b')}</p>

      <div className="card" style={{ margin: '16px 0' }}>
        <form className="inline" onSubmit={add}>
          <input className="input" style={{ maxWidth: 280 }} type="email" placeholder={t('athlete_email')}
            value={email} onChange={e => setEmail(e.target.value)} required />
          <button className="btn" type="submit" disabled={busy}>{busy ? '…' : t('add_athlete')}</button>
          <span className="muted small">{t('add_athlete_b')}</span>
        </form>
        {msg && <div className="small" style={{ marginTop: 8 }}>{msg}</div>}
      </div>

      {!data?.length ? <div className="empty">{t('no_athletes')}</div> : (
        <div className="list">
          {data.map(a => (
            <div key={a.athlete_id} className="card between">
              <span className="name">{a.profile?.display_name || a.athlete_id.slice(0, 8)}</span>
              <span className="mono small muted">{a.athlete_id.slice(0, 8)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
