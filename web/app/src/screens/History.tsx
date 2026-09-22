import { loadHistory, loadSession, type SessionRow } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { fmtClock } from '../lib/active';
import { Failed, Loading } from '../components/Status';

const totals = (s: SessionRow) => {
  const done = s.sets.filter(x => x.completed);
  return { done: done.length, total: s.sets.length, volume: Math.round(done.reduce((v, x) => v + (x.reps || 0) * (x.weight_kg || 0), 0)) };
};

export function History() {
  const { t, nm, lang } = useI18n();
  const { data, error, loading, reload } = useLoad(loadHistory, []);
  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  return (
    <>
      <h1>{t('history')}</h1>
      {!data?.length ? <div className="empty"><strong>{t('no_history')}</strong>{t('no_history_b')}</div> : (
        <div className="list" style={{ marginTop: 16 }}>
          {data.map(s => { const x = totals(s); return (
            <button key={s.id} className="row-btn" type="button" onClick={() => go(`/done/${s.id}`)}>
              <span><span className="name">{nm(s.workout?.names) || '—'}</span>
                <span className="muted small" style={{ display: 'block' }}>
                  {new Date(s.finished_at).toLocaleString(lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{fmtClock(s.duration_seconds)} · {x.done}/{x.total}
                </span></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>); })}
        </div>
      )}
    </>
  );
}

export function Done({ id }: { id: string }) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(() => loadSession(id), [id]);
  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  if (!data) return <div className="empty">{t('not_found')}</div>;
  const x = totals(data);
  return (
    <>
      <div className="muted small">{nm(data.workout?.names)}</div>
      <h1>{t('done_title')}</h1>
      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat"><b>{fmtClock(data.duration_seconds)}</b><span>{t('duration')}</span></div>
        <div className="stat"><b>{x.done}/{x.total}</b><span>{t('sets_done')}</span></div>
        <div className="stat"><b>{x.volume}</b><span>{t('volume')}</span></div>
      </div>
      <button className="btn primary block" type="button" style={{ marginTop: 20 }} onClick={() => go('/')}>{t('back_home')}</button>
    </>
  );
}
