import { useState } from 'react';
import { createTemplate, deleteProgram, loadLibrary } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { Failed, Loading } from '../components/Status';

export function Library({ me }: { me: string }) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(loadLibrary, []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  const templates = data!.filter(p => p.is_template);
  const plans = data!.filter(p => !p.is_template);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { const id = await createTemplate(me, { en: name, es: name }); go(`/program/${id}`); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h1>{t('library')}</h1>
      <p className="muted">{t('library_b')}</p>

      <form className="inline card" style={{ margin: '16px 0' }} onSubmit={create}>
        <input className="input" style={{ maxWidth: 280 }} placeholder={t('template_name')}
          value={name} onChange={e => setName(e.target.value)} required />
        <button className="btn" type="submit" disabled={busy}>{t('new_template')}</button>
      </form>

      {!templates.length ? <div className="empty">{t('nothing_yet')}</div> : (
        <div className="list">
          {templates.map(p => (
            <div key={p.id} className="card between">
              <button className="link" type="button" style={{ textAlign: 'left' }} onClick={() => go(`/program/${p.id}`)}>
                <span className="name">{nm(p.names)}</span>
                <span className="muted small" style={{ display: 'block' }}>
                  {p.workouts.length ? `${p.workouts.length} × ${t('workouts').toLowerCase()}` : t('nothing_yet')}
                  {p.visibility === 'public' ? ' · public' : ''}{p.level ? ` · ${p.level}` : ''}
                </span>
              </button>
              <span className="inline">
                <button className="btn mini" type="button" onClick={() => go(`/assign/${p.id}`)}>{t('assign')}</button>
                <button className="btn mini danger" type="button"
                  onClick={() => confirm(t('confirm_delete')) && deleteProgram(p.id).then(reload)}>{t('delete')}</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {!!plans.length && (
        <>
          <h3 className="lvl">{t('plans')}</h3>
          <div className="list">
            {plans.map(p => (
              <div key={p.id} className="card between">
                <button className="link" type="button" style={{ textAlign: 'left' }} onClick={() => go(`/program/${p.id}`)}>
                  <span className="name">{nm(p.names)}</span>
                </button>
                <span className="muted small">{p.workouts.length} × {t('workouts').toLowerCase()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
