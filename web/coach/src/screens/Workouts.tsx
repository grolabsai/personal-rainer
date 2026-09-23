import { useState } from 'react';
import { createStandaloneWorkout, deleteProgram, loadLibrary } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { Failed, Loading } from '../components/Status';

// Workouts built on their own, to be dragged into a programme's days later. Each one is a
// one-workout template, so nothing about it is special: the same editor, the same copy.
export function Workouts({ me }: { me: string }) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(loadLibrary, []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  const workouts = data!.filter(p => p.is_template && p.kind === 'workout');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { const { workout } = await createStandaloneWorkout(me, { en: name, es: name }); go(`/workout/${workout}`); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h1>{t('workouts_lib')}</h1>
      <p className="muted">{t('workouts_lib_b')}</p>

      <form className="inline card" style={{ margin: '16px 0' }} onSubmit={create}>
        <input className="input" style={{ maxWidth: 280 }} placeholder={t('workout_name')}
          value={name} onChange={e => setName(e.target.value)} required />
        <button className="btn" type="submit" disabled={busy}>{t('new_workout_lib')}</button>
      </form>

      {!workouts.length ? <div className="empty">{t('nothing_yet')}</div> : (
        <div className="list">
          {workouts.map(p => (
            <div key={p.id} className="card between">
              <button className="link" type="button" style={{ textAlign: 'left' }}
                onClick={() => p.workouts[0] && go(`/workout/${p.workouts[0].id}`)}>
                <span className="name">{nm(p.names)}</span>
              </button>
              <button className="btn mini danger" type="button"
                onClick={() => confirm(t('confirm_delete')) && deleteProgram(p.id).then(reload)}>{t('delete')}</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
