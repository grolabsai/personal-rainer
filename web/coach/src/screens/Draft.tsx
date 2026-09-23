import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useI18n, type Names } from '../lib/i18n';
import { go } from '../lib/router';

type DraftSet = {
  kind?: string; reps_min?: number; reps_max?: number; duration_seconds?: number;
  reps_per_side?: boolean; load_kg?: number; rpe?: number; rest_seconds?: number;
  side?: string; other_side?: string;
};
type DraftItem = { exercise_id: string; attributes?: { dimension_id: string; value: string }[]; sets: DraftSet[] };
type DraftBlock = { purpose: string; mode: string; rounds?: number; names?: Names; items: DraftItem[] };
type DraftWorkout = { names: Names; day_of_week?: number; blocks: DraftBlock[] };
type DraftProgram = {
  names: Names; descriptions?: Names; schedule_mode?: string; days_per_week?: number; weeks?: number;
  level?: string; goal?: string; workouts: DraftWorkout[];
};

const line = (s: DraftSet) => {
  const reps = s.duration_seconds ? `${s.duration_seconds} s`
    : s.reps_max && s.reps_max !== s.reps_min ? `${s.reps_min}–${s.reps_max}`
    : s.reps_min != null ? `${s.reps_min}` : 'AMRAP';
  const bits = [reps + (s.reps_per_side ? '/side' : '')];
  if (s.load_kg != null) bits.push(`${s.load_kg} kg`);
  if (s.rpe != null) bits.push(`RPE ${s.rpe}`);
  if (s.side && s.side !== 'both') bits.push(s.other_side === 'hold' ? `${s.side}, other holds` : s.side);
  return bits.join(' · ');
};

// The coach describes the programme; the model drafts it; the coach edits it like any other
// template. The draft is only saved when they say so.
export function Draft() {
  const { t, nm } = useI18n();
  const [prompt, setPrompt] = useState('');
  const [days, setDays] = useState(3);
  const [weeks, setWeeks] = useState(4);
  const [level, setLevel] = useState('intermediate');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<DraftProgram | null>(null);

  const run = async () => {
    setBusy(true); setError(''); setDraft(null);
    try {
      const { data, error } = await supabase.functions.invoke('draft-program', {
        body: { prompt, params: { days_per_week: days, weeks, level } },
      });
      if (error) {
        // the function's own message is the useful one; it arrives in the response body
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      setDraft(data.draft as DraftProgram);
    } catch (e) { setError((e as Error).message || t('failed')); }
    setBusy(false);
  };

  const accept = async () => {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const { data, error } = await supabase.rpc('create_program_from_json', { p: draft });
      if (error) throw error;
      go(`/program/${data}`);
    } catch (e) { setError((e as { message?: string }).message || t('failed')); }
    setBusy(false);
  };

  return (
    <>
      <h1>{t('draft_title')}</h1>
      <p className="muted">{t('draft_b')}</p>

      <div className="card" style={{ marginTop: 12 }}>
        <textarea className="input" rows={4} style={{ resize: 'vertical' }} placeholder={t('draft_placeholder')}
          value={prompt} onChange={e => setPrompt(e.target.value)} />
        <div className="inline" style={{ marginTop: 10 }}>
          <label className="small muted">{t('days_per_week')}
            <input className="input mini" type="number" min={1} max={7} style={{ width: 64, marginLeft: 6 }}
              value={days} onChange={e => setDays(Number(e.target.value))} /></label>
          <label className="small muted">{t('weeks_label')}
            <input className="input mini" type="number" min={1} max={24} style={{ width: 64, marginLeft: 6 }}
              value={weeks} onChange={e => setWeeks(Number(e.target.value))} /></label>
          <select value={level} onChange={e => setLevel(e.target.value)}>
            <option value="beginner">{t('level_beginner')}</option>
            <option value="intermediate">{t('level_intermediate')}</option>
            <option value="advanced">{t('level_advanced')}</option>
          </select>
          <button className="btn primary" type="button" disabled={busy || prompt.trim().length < 10} onClick={run}>
            {busy ? t('drafting') : t('draft_go')}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {draft && (
        <>
          <div className="between" style={{ marginTop: 20 }}>
            <h3 className="lvl">{nm(draft.names)}</h3>
            <button className="btn primary" type="button" disabled={busy} onClick={accept}>{t('draft_accept')}</button>
          </div>
          {nm(draft.descriptions) && <p className="muted">{nm(draft.descriptions)}</p>}
          <p className="sub">{t('draft_edit_b')}</p>

          {draft.workouts.map((w, wi) => (
            <div key={wi} className="block-card">
              <div className="between">
                <strong>{nm(w.names)}</strong>
                <span className="muted small">{w.day_of_week ? `· ${t(['mon','tue','wed','thu','fri','sat','sun'][w.day_of_week - 1] as 'mon')}` : ''}</span>
              </div>
              {w.blocks.map((b, bi) => (
                <div key={bi} className="item-card">
                  <div className="inline">
                    <span className={`badge p-${b.purpose}`}>{t(`purpose_${b.purpose}` as 'purpose_main')}</span>
                    {b.mode === 'rounds' && <span className="badge">× {b.rounds}</span>}
                    <span className="muted small">{nm(b.names)}</span>
                  </div>
                  {b.items.map((i, ii) => (
                    <div key={ii} className="small" style={{ marginTop: 6 }}>
                      <strong>{i.exercise_id}</strong>
                      {i.attributes?.length ? <span className="muted"> ({i.attributes.map(a => `${a.dimension_id}=${a.value}`).join(', ')})</span> : null}
                      <span className="muted"> — {i.sets.map(line).join(' / ')}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </>
  );
}
