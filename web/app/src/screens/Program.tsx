import { loadProgram } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { Failed, Loading } from '../components/Status';

export function Program({ id }: { id: string }) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(() => loadProgram(id), [id]);
  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  if (!data) return <div className="empty">{t('not_found')}</div>;
  const workouts = [...data.workouts].sort((a, b) => a.position - b.position);
  return (
    <>
      <h1>{nm(data.names)}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{nm(data.descriptions)}</p>
      <div className="list" style={{ marginTop: 16 }}>
        {workouts.map(w => (
          <button key={w.id} className="row-btn" type="button" onClick={() => go(`/workout/${w.id}`)}>
            <span><span className="name">{nm(w.names)}</span>
              <span className="muted small" style={{ display: 'block' }}>{t('exercises_n', w.items[0]?.count ?? 0)}</span></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </>
  );
}
