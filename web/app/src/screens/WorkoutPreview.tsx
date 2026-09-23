import { go } from '../lib/router';
import { loadWorkout } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { useLoad } from '../lib/useLoad';
import { itemSummary } from '../lib/prescription';
import type { ActiveSession, Block, Workout } from '../lib/types';
import { Failed, Loading } from '../components/Status';

const purposeKey = (p: Block['purpose']) => `purpose_${p}` as 'purpose_main';

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
  const exercises = data.blocks.reduce((n, b) => n + b.items.length, 0);

  return (
    <>
      <div className="muted small">{nm(data.program?.names)}</div>
      <h1>{nm(data.names)}</h1>
      <div className="muted small">{t('blocks_n', data.blocks.length)} · {t('exercises_n', exercises)}</div>
      {nm(data.notes) && <p className="muted">{nm(data.notes)}</p>}

      {data.blocks.map(block => (
        <section key={block.id}>
          <h3 className="lvl" style={{ marginTop: 20 }}>
            {nm(block.names) || t(purposeKey(block.purpose))}
            {block.mode === 'rounds' && block.rounds
              ? <span className="badge l2" style={{ marginLeft: 8 }}>{t('round_of', block.rounds, block.rounds).replace(/^\S+\s/, '× ')}</span>
              : null}
          </h3>
          {block.mode === 'rounds' && !!block.rest_between_rounds_s && (
            <p className="sub">{t('rest_between_rounds', block.rest_between_rounds_s)}</p>
          )}
          <div className="list">
            {block.items.map(item => {
              const variant = active?.swaps?.[item.id] || item.variant;
              return (
                <button key={item.id} className="card ex-row as-row" type="button"
                  onClick={() => variant && go(`/exercise/${variant.id}?item=${item.id}`)}>
                  <img className="thumb" src={mediaUrl(variant?.image_path)} alt="" loading="lazy" />
                  <div>
                    <div className="name">{nm(variant?.names) || item.exercise_id}</div>
                    <div className="plan">{itemSummary(item, t)}</div>
                    {item.substitution_note?.status === 'substituted' && (
                      <div className="plan" style={{ color: 'var(--gl-text-tertiary)' }}>{t('swapped_here')}</div>
                    )}
                    {item.substitution_note?.load_warning && (
                      <div className="plan" style={{ color: 'var(--gl-warning-text)' }}>
                        {t('load_warning', item.substitution_note.load_warning.needs_kg,
                           item.substitution_note.load_warning.available_kg)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {other && <div className="error" style={{ marginTop: 16 }}>{t('resume_b', nm(active!.workoutNames))}</div>}
      <button className="btn primary block" type="button" style={{ marginTop: 16 }} disabled={!!other || !exercises}
        onClick={() => onStart(data, assignmentId)}>
        {active && active.workoutId === data.id ? t('resume') : t('start')}
      </button>
    </>
  );
}
