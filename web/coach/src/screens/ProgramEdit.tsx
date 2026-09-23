import { useState } from 'react';
import { addWorkout, copyWorkout, deleteRow, loadLibrary, updateProgram, updateWorkout } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { Failed, Loading } from '../components/Status';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function ProgramEdit({ id }: { id: string }) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(loadLibrary, []);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<number | null>(null);
  const program = data?.find(p => p.id === id);

  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  if (!program) return <div className="empty">{t('nothing_yet')}</div>;

  const library = data!.filter(p => p.is_template && p.kind === 'workout' && p.workouts.length);
  const patch = async (p: Record<string, unknown>) => { setBusy(true); await updateProgram(id, p); await reload(); setBusy(false); };
  const nextPos = () => (program.workouts.at(-1)?.position || 0) + 1;

  // Dropping onto a day either brings a workout in from the library, or moves one already here.
  const dropOn = async (day: number | null, e: React.DragEvent) => {
    const fromLibrary = e.dataTransfer.getData('text/x-workout-copy');
    const move = e.dataTransfer.getData('text/x-workout-move');
    setBusy(true);
    if (fromLibrary) await copyWorkout(fromLibrary, id, day, nextPos());
    else if (move) await updateWorkout(move, { day_of_week: day });
    await reload(); setBusy(false);
  };

  const add = async () => {
    setBusy(true);
    const pos = nextPos();
    const wid = await addWorkout(id, { en: `Day ${pos}`, es: `Día ${pos}` }, program.schedule_mode === 'weekly' ? Math.min(pos, 7) : null, pos);
    setBusy(false);
    go(`/workout/${wid}`);
  };

  const chip = (w: typeof program.workouts[number]) => (
    <div key={w.id} className="pill eq" draggable style={{ marginBottom: 4 }}
      onDragStart={e => { e.dataTransfer.setData('text/x-workout-move', w.id); e.dataTransfer.effectAllowed = 'move'; }}>
      <button className="link" type="button" style={{ padding: 0 }} onClick={() => go(`/workout/${w.id}`)}>{nm(w.names)}</button>
      <button className="link" type="button" style={{ padding: '0 2px' }}
        onClick={() => confirm(t('confirm_delete')) && deleteRow('program_workouts', w.id).then(reload)}>×</button>
    </div>
  );

  return (
    <>
      <button className="link" type="button" onClick={() => go('/library')}>‹ {t('library')}</button>
      <div className="between">
        <h1>{nm(program.names)}</h1>
        <span className="inline">
          <button className="btn" type="button" disabled={busy} onClick={add}>{t('new_workout')}</button>
          <button className="btn primary" type="button" onClick={() => go(`/assign/${id}`)}>{t('assign')}</button>
        </span>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="formrow"><label>{t('template_name')}</label>
            <input className="input" defaultValue={program.names?.en || ''}
              onBlur={e => patch({ names: { ...program.names, en: e.target.value } })} /></div>
          <div className="formrow"><label>{t('schedule')}</label>
            <select value={program.schedule_mode} onChange={e => patch({ schedule_mode: e.target.value })}>
              <option value="weekly">{t('sched_weekly')}</option>
              <option value="dated">{t('sched_dated')}</option>
              <option value="sequence">{t('sched_sequence')}</option>
            </select></div>
          {program.schedule_mode === 'weekly' && (
            <div className="formrow"><label>{t('cycle_weeks')}</label>
              <input className="input" type="number" min={1} max={12} defaultValue={program.cycle_weeks}
                onBlur={e => patch({ cycle_weeks: Number(e.target.value) })} /></div>
          )}
          <div className="formrow"><label>{t('tracking')}</label>
            <select value={program.track_mode} onChange={e => patch({ track_mode: e.target.value })}>
              <option value="full">{t('track_full')}</option>
              <option value="completion">{t('track_completion')}</option>
              <option value="none">{t('track_none')}</option>
            </select></div>
          <div className="formrow"><label>{t('level')}</label>
            <select value={program.level || ''} onChange={e => patch({ level: e.target.value || null })}>
              <option value="">—</option>
              <option value="beginner">{t('level_beginner')}</option>
              <option value="intermediate">{t('level_intermediate')}</option>
              <option value="advanced">{t('level_advanced')}</option>
            </select></div>
          <div className="formrow"><label>{t('goal')}</label>
            <input className="input" defaultValue={program.goal || ''} onBlur={e => patch({ goal: e.target.value || null })} /></div>
        </div>

        <div className="card">
          <h3 className="lvl" style={{ marginTop: 0 }}>{t('workouts_lib')}</h3>
          <p className="sub">{t('drag_workout_here')}</p>
          {!library.length && <div className="empty">{t('nothing_yet')}</div>}
          {library.map(p => (
            <div key={p.id} className="kitrow" style={{ gridTemplateColumns: '1fr auto' }} draggable
              onDragStart={e => {
                e.dataTransfer.setData('text/x-workout-copy', p.workouts[0].id);
                e.dataTransfer.effectAllowed = 'copy';
              }}>
              <span>{nm(p.names)}</span>
              <span className="muted small">⠿</span>
            </div>
          ))}
        </div>
      </div>

      {program.schedule_mode === 'weekly' ? (
        <>
          <h3 className="lvl">{t('workouts')}</h3>
          <div className="dayslots">
            {DAYS.map((d, i) => (
              <div key={d} className={`dayslot ${over === i + 1 ? 'over' : ''}`}
                onDragOver={e => { e.preventDefault(); setOver(i + 1); }}
                onDragLeave={() => setOver(null)}
                onDrop={e => { e.preventDefault(); setOver(null); dropOn(i + 1, e); }}>
                <h4>{t(d)}</h4>
                {program.workouts.filter(w => w.day_of_week === i + 1).map(chip)}
                {!program.workouts.some(w => w.day_of_week === i + 1) && <span className="muted small">{t('day_slot_empty')}</span>}
              </div>
            ))}
            <div className={`dayslot ${over === 0 ? 'over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOver(0); }}
              onDragLeave={() => setOver(null)}
              onDrop={e => { e.preventDefault(); setOver(null); dropOn(null, e); }}>
              <h4>{t('no_day')}</h4>
              {program.workouts.filter(w => !w.day_of_week).map(chip)}
            </div>
          </div>
        </>
      ) : (
        <>
          <h3 className="lvl">{t('workouts')}</h3>
          <div className={`dayslot ${over === 0 ? 'over' : ''}`} style={{ maxWidth: 420 }}
            onDragOver={e => { e.preventDefault(); setOver(0); }}
            onDragLeave={() => setOver(null)}
            onDrop={e => { e.preventDefault(); setOver(null); dropOn(null, e); }}>
            {program.workouts.map(chip)}
            {!program.workouts.length && <span className="muted small">{t('drag_workout_here')}</span>}
          </div>
        </>
      )}
    </>
  );
}
