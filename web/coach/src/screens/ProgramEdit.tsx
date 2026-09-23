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
  const program = data?.find(p => p.id === id);

  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  if (!program) return <div className="empty">{t('nothing_yet')}</div>;

  const patch = async (p: Record<string, unknown>) => { setBusy(true); await updateProgram(id, p); await reload(); setBusy(false); };
  const add = async () => {
    setBusy(true);
    const pos = (program.workouts.at(-1)?.position || 0) + 1;
    const wid = await addWorkout(id, { en: `Day ${pos}`, es: `Día ${pos}` }, program.schedule_mode === 'weekly' ? Math.min(pos, 7) : null, pos);
    setBusy(false);
    go(`/workout/${wid}`);
  };
  const copy = async (source: string) => {
    setBusy(true);
    const pos = (program.workouts.at(-1)?.position || 0) + 1;
    await copyWorkout(source, id, program.schedule_mode === 'weekly' ? Math.min(pos, 7) : null, pos);
    await reload(); setBusy(false);
  };

  return (
    <>
      <button className="link" type="button" onClick={() => go('/library')}>‹ {t('library')}</button>
      <div className="between">
        <h1>{nm(program.names)}</h1>
        <button className="btn" type="button" onClick={() => go(`/assign/${id}`)}>{t('assign')}</button>
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
          <div className="between">
            <h3 className="lvl" style={{ marginTop: 0 }}>{t('workouts')}</h3>
            <button className="btn mini" type="button" disabled={busy} onClick={add}>{t('new_workout')}</button>
          </div>
          {!program.workouts.length && <div className="empty">{t('nothing_yet')}</div>}
          {program.workouts.map(w => (
            <div key={w.id} className="kitrow" style={{ gridTemplateColumns: '1fr auto auto' }}>
              <button className="link" type="button" style={{ textAlign: 'left' }} onClick={() => go(`/workout/${w.id}`)}>
                {nm(w.names)}
              </button>
              {program.schedule_mode === 'weekly' ? (
                <select value={w.day_of_week ?? ''} onChange={e => updateWorkout(w.id, { day_of_week: e.target.value ? Number(e.target.value) : null }).then(reload)}>
                  <option value="">{t('no_day')}</option>
                  {DAYS.map((d, i) => <option key={d} value={i + 1}>{t(d)}</option>)}
                </select>
              ) : <span />}
              <span className="inline">
                <button className="btn mini" type="button" disabled={busy} onClick={() => copy(w.id)}>{t('duplicate')}</button>
                <button className="btn mini danger" type="button"
                  onClick={() => confirm(t('confirm_delete')) && deleteRow('program_workouts', w.id).then(reload)}>×</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
