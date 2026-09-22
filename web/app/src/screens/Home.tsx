import { loadHome } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import type { ActiveSession } from '../lib/types';
import { Failed, Loading } from '../components/Status';

export function Home({ name, active }: { name: string; active: ActiveSession | null }) {
  const { t, nm, lang } = useI18n();
  const { data, error, loading, reload } = useLoad(loadHome, []);
  const date = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <>
      <h1>{t('hello', name)}</h1>
      {active && (
        <div className="card" style={{ borderColor: 'var(--gl-accent-ink)', marginTop: 16 }}>
          <div className="muted small">{t('resume_b', nm(active.workoutNames))}</div>
          <button className="btn primary block" type="button" style={{ marginTop: 10 }} onClick={() => go('/play')}>{t('resume')}</button>
        </div>
      )}
      {loading && !data && <Loading />}
      {!!error && <Failed onRetry={reload} />}
      {data && (
        <>
          <h2>{t('assigned')}</h2>
          {data.assignments.length ? (
            <div className="list">
              {data.assignments.filter(a => a.workout).map(a => (
                <button key={a.id} className="row-btn" type="button" onClick={() => go(`/workout/${a.workout!.id}?a=${a.id}`)}>
                  <span>
                    <span className="name">{nm(a.workout!.names)}</span>
                    <span className="muted small" style={{ display: 'block' }}>
                      {nm(a.workout!.program?.names)} · {a.scheduled_for ? t('scheduled', date(a.scheduled_for)) : t('unscheduled')} · {t('exercises_n', a.workout!.items[0]?.count ?? 0)}
                    </span>
                  </span>
                  <span className="chev" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty"><strong>{t('no_assigned')}</strong>{t('no_assigned_b')}</div>
          )}

          <h2>{t('library')}</h2>
          <div className="list">
            {data.templates.map(p => (
              <button key={p.id} className="row-btn" type="button" onClick={() => go(`/program/${p.id}`)}>
                <span>
                  <span className="name">{nm(p.names)}</span>
                  <span className="muted small" style={{ display: 'block' }}>{nm(p.descriptions)}</span>
                  <span className="muted small">{t('workouts_n', p.workouts.length)}</span>
                </span>
                <span className="chev" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
