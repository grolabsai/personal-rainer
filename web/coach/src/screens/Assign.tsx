import { useState } from 'react';
import { assignProgram, loadAthletes, loadLibrary, loadPlaces, loadPlanSummary, loadEnrollments } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { Failed, Loading } from '../components/Status';

const today = () => new Date().toISOString().slice(0, 10);

// Assigning is the moment a template becomes a prescription: it is copied, every exercise is
// resolved against what that place has, and the result is shown before anyone trains on it.
export function Assign({ programId }: { programId: string }) {
  const { t, nm } = useI18n();
  const setup = useLoad(async () => ({
    athletes: await loadAthletes(), places: (await loadPlaces()).places, programs: await loadLibrary(),
  }), []);
  const [athlete, setAthlete] = useState('');
  const [place, setPlace] = useState('');
  const [start, setStart] = useState(today());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);

  if (setup.loading && !setup.data) return <Loading />;
  if (setup.error) return <Failed onRetry={setup.reload} />;
  const { athletes, places, programs } = setup.data!;
  const program = programs.find(p => p.id === programId);
  const forAthlete = places.filter(p => !athlete || p.owner_id === athlete || p.visibility === 'public');

  const submit = async () => {
    setBusy(true); setFailed('');
    try {
      await assignProgram(programId, athlete, place, start);
      const rows = await loadEnrollments();
      setPlanId(rows[0]?.program?.id ?? null);
    } catch (e) { setFailed((e as { message?: string }).message || t('failed')); }
    setBusy(false);
  };

  return (
    <>
      <button className="link" type="button" onClick={() => go(`/program/${programId}`)}>‹ {nm(program?.names)}</button>
      <h1>{t('assign_to')}</h1>
      <p className="muted">{t('assign_b')}</p>

      <div className="card" style={{ marginTop: 12, maxWidth: 520 }}>
        <div className="formrow"><label>{t('athlete')}</label>
          <select value={athlete} onChange={e => { setAthlete(e.target.value); setPlace(''); }}>
            <option value="">—</option>
            {athletes.map(a => <option key={a.athlete_id} value={a.athlete_id}>{a.profile?.display_name || a.athlete_id.slice(0, 8)}</option>)}
          </select></div>
        <div className="formrow"><label>{t('place')}</label>
          <select value={place} onChange={e => setPlace(e.target.value)}>
            <option value="">—</option>
            {forAthlete.map(p => <option key={p.id} value={p.id}>{nm(p.names)}</option>)}
          </select></div>
        <div className="formrow"><label>{t('starts')}</label>
          <input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
        {failed && <div className="error">{failed}</div>}
        <button className="btn primary block" type="button" disabled={busy || !athlete || !place} onClick={submit}>
          {busy ? t('saving') : t('assign')}
        </button>
      </div>

      {planId && <Resolved planId={planId} />}
    </>
  );
}

function Resolved({ planId }: { planId: string }) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(() => loadPlanSummary(planId), [planId]);
  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  return (
    <>
      <h3 className="lvl">{t('assigned_ok')}</h3>
      <div className="list">
        {data!.map(row => (
          <div key={row.id} className="card">
            <div className="between">
              <span className="itemhead" style={{ gridTemplateColumns: '48px minmax(0, 1fr)' }}>
                <img src={mediaUrl(row.variant?.image_path)} alt="" loading="lazy" />
                <span>
                <span className="name">{nm(row.variant?.names) || row.exercise_id}</span>
                <span className="muted small" style={{ display: 'block' }}>
                  {nm(row.block?.workout.names)} · {t(`purpose_${row.block?.purpose}` as 'purpose_main')}
                </span>
                </span>
              </span>
              {row.substitution_note?.status === 'substituted' && <span className="badge l2">{t('swapped')}</span>}
              {row.substitution_note?.status === 'unavailable' && <span className="badge l3">{t('unavailable')}</span>}
            </div>
            {row.substitution_note?.load_warning && (
              <div className="flag">{t('load_flag', row.substitution_note.load_warning.needs_kg, row.substitution_note.load_warning.available_kg)}</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
