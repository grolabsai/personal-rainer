import { go } from '../lib/router';
import { loadWorkout } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { useLoad } from '../lib/useLoad';
import type { ActiveSession, Workout } from '../lib/types';
import { Failed, Loading } from '../components/Status';

export function WorkoutPreview({ id, assignmentId, active, onStart }: {
  id: string; assignmentId: string | null; active: ActiveSession | null;
  onStart: (w: Workout, assignmentId: string | null) => void;
}) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(() => loadWorkout(id), [id]);
  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  if (!data) return <div className="empty">{t('not_found')}</div>;
  const other = active && active.workoutId !== data.id;

  return (
    <>
      <div className="muted small">{nm(data.program?.names)}</div>
      <h1>{nm(data.names)}</h1>
      {nm(data.notes) && <p className="muted">{nm(data.notes)}</p>}
      <div className="list" style={{ marginTop: 16 }}>
        {data.items.map(it => (
          <button key={it.id} className="card ex-row as-row" type="button"
            onClick={() => go(`/exercise/${(active?.swaps?.[it.id] || it.variant).id}?item=${it.id}`)}>
            <img className="thumb" src={mediaUrl((active?.swaps?.[it.id] || it.variant).image_path)} alt="" loading="lazy" />
            <div>
              <div className="name">{nm((active?.swaps?.[it.id] || it.variant).names)}</div>
              <div className="plan">{t('plan', it.sets, it.reps)}{it.weight_kg != null ? ` · ${it.weight_kg} ${t('kg')}` : ''} · {t('rest_s', it.rest_seconds)}</div>
            </div>
          </button>
        ))}
      </div>
      {other && <div className="error" style={{ marginTop: 16 }}>{t('resume_b', nm(active!.workoutNames))}</div>}
      <button className="btn primary block" type="button" style={{ marginTop: 16 }} disabled={!!other || !data.items.length}
        onClick={() => onStart(data, assignmentId)}>
        {active && active.workoutId === data.id ? t('resume') : t('start')}
      </button>
    </>
  );
}
