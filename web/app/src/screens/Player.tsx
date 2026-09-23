import { useEffect, useMemo, useRef, useState } from 'react';
import { saveSession } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { go } from '../lib/router';
import { fmtClock, isTimed, restAfter, stepsOf, variantOf } from '../lib/active';
import { kindLabel, setLine, setVariantName, sideLabel } from '../lib/prescription';
import type { ActiveSession, Block, SetEntry, Workout } from '../lib/types';

type Props = {
  active: ActiveSession;
  workout: Workout;
  onChange: (a: ActiveSession) => void;
  onFinished: (sessionId: string) => void;
  onDiscard: () => void;
};

const purposeKey = (p: Block['purpose']) => `purpose_${p}` as 'purpose_main';

export function Player({ active, workout, onChange, onFinished, onDiscard }: Props) {
  const { t, nm, lang } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);

  // Rest ends: clear it and buzz the phone where supported.
  useEffect(() => {
    if (active.restUntil && now >= active.restUntil) {
      if ('vibrate' in navigator) navigator.vibrate?.([200, 100, 200]);
      onChange({ ...active, restUntil: null });
    }
  }, [now, active, onChange]);

  useEffect(() => {
    const d = dialog.current; if (!d) return;
    if (confirm && !d.open) d.showModal();
    if (!confirm && d.open) d.close();
  }, [confirm]);

  // A straight block gives one step per exercise; a rounds block one step per exercise per round.
  const steps = useMemo(() => stepsOf(workout), [workout]);
  const idx = Math.min(active.current, steps.length - 1);
  const step = steps[idx];
  const track = workout.program?.track_mode || 'full';
  const entry = (id: string): SetEntry => active.sets[id] || { reps: '', weight: '', done: false };
  const stepDone = (i: number) => steps[i].sets.every(s => entry(s.id).done);
  const allDone = steps.flatMap(s => s.sets).filter(s => entry(s.id).done).length;
  const allSets = steps.reduce((n, s) => n + s.sets.length, 0);
  const elapsed = (now - new Date(active.startedAt).getTime()) / 1000;
  const restLeft = active.restUntil ? (active.restUntil - now) / 1000 : 0;
  const variant = variantOf(step, step.sets.length === 1 ? step.sets[0] : undefined, active);

  const update = (id: string, patch: Partial<SetEntry>) =>
    onChange({ ...active, sets: { ...active.sets, [id]: { ...entry(id), ...patch } } });

  const toggle = (setId: string) => {
    const becomingDone = !entry(setId).done;
    const set = step.sets.find(s => s.id === setId)!;
    const last = idx === steps.length - 1 && step.sets.every(s => s.id === setId ? becomingDone : entry(s.id).done);
    const rest = restAfter(step, set);
    onChange({
      ...active,
      sets: { ...active.sets, [setId]: { ...entry(setId), done: becomingDone } },
      restUntil: becomingDone && !last && rest > 0 ? Date.now() + rest * 1000 : active.restUntil,
    });
  };
  const goTo = (i: number) => onChange({ ...active, current: Math.max(0, Math.min(steps.length - 1, i)) });

  const finish = async () => {
    setSaving(true); setSaveError(false);
    try { onFinished(await saveSession(active, workout)); }
    catch { setSaveError(true); setSaving(false); setConfirm(null); }
  };

  return (
    <>
      <div className="player-top">
        <span className="clock" aria-label={t('duration')}>{fmtClock(elapsed)}</span>
        <span className="muted small">{t('step_of', idx + 1, steps.length)}</span>
      </div>
      <div className="dots" role="tablist">
        {steps.map((s, i) => (
          <button key={s.key} type="button" role="tab" aria-selected={i === idx} aria-label={nm(s.item.variant?.names)}
            className={`dot ${stepDone(i) ? 'done' : ''} ${i === idx ? 'current' : ''}`} onClick={() => goTo(i)} />
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="blockbar">
          <span className={`badge p-${step.block.purpose}`}>{t(purposeKey(step.block.purpose))}</span>
          <span className="muted small">{nm(step.block.names)}</span>
          {step.block.mode === 'rounds' && <span className="muted small">{t('round_of', step.round, step.rounds)}</span>}
        </div>

        <div className="media-box"><img src={mediaUrl(variant?.gif_path)} alt={nm(variant?.names)} /></div>
        <h1 style={{ fontSize: 21 }}>{nm(variant?.names) || step.item.exercise_id}</h1>
        {active.swaps?.[step.item.id] && <div className="swapped"><span>{t('swapped_to', nm(variant?.names))}</span></div>}
        {step.item.substitution_note?.status === 'substituted' && !active.swaps?.[step.item.id] && (
          <div className="muted small">{t('swapped_here')}</div>
        )}
        {nm(step.item.notes) && <p className="small">{nm(step.item.notes)}</p>}
        {variant && (
          <button className="link" type="button" style={{ padding: '6px 0' }}
            onClick={() => go(`/exercise/${variant.id}?item=${step.item.id}`)}>{t('details')} ›</button>
        )}

        <div className="sets" style={{ marginTop: 8 }}>
          {step.sets.map(set => {
            const e = entry(set.id);
            const timed = isTimed(set);
            const per = setVariantName(set, step.item, nm);
            const side = sideLabel(set, t);
            const kind = kindLabel(set, t);
            return (
              <div key={set.id} className={`setcard ${e.done ? 'done' : ''}`}>
                <div className="setline">
                  <span className="n">{step.block.mode === 'rounds' ? step.round : set.set_number}</span>
                  <span className="pres">{setLine(set, t)}</span>
                  {kind && <span className="badge">{kind}</span>}
                </div>
                {(per || side || nm(set.notes)) && (
                  <div className="setwhy">
                    {per && <span className="pill eq">{per}</span>}
                    {side && <span className="pill">{side}</span>}
                    {nm(set.notes) && <span className="muted small">{nm(set.notes)}</span>}
                  </div>
                )}
                <div className="setinputs">
                  {track === 'full' && (
                    <>
                      <input className="input" inputMode="numeric" aria-label={timed ? 's' : t('reps')}
                        value={e.reps} onChange={ev => update(set.id, { reps: ev.target.value })} />
                      <input className="input" inputMode="decimal" placeholder="—" aria-label={t('weight')}
                        value={e.weight} onChange={ev => update(set.id, { weight: ev.target.value })} />
                    </>
                  )}
                  <button className="tick" type="button" aria-pressed={e.done}
                    aria-label={`${t('set')} ${set.set_number}`} onClick={() => toggle(set.id)}>✓</button>
                </div>
              </div>
            );
          })}
        </div>

        {!!variant?.instruction_steps?.[lang]?.length && (
          <details className="instructions">
            <summary>{t('instructions')}</summary>
            <ol>{(variant.instruction_steps[lang] || variant.instruction_steps.en || []).map((st, i) => <li key={i}>{st}</li>)}</ol>
          </details>
        )}

        <div className="player-nav">
          <button className="btn" type="button" disabled={idx === 0} onClick={() => goTo(idx - 1)}>{t('previous')}</button>
          {idx < steps.length - 1
            ? <button className={`btn ${stepDone(idx) ? 'primary' : ''}`} type="button" onClick={() => goTo(idx + 1)}>{t('next')}</button>
            : <button className="btn primary" type="button" onClick={() => setConfirm('finish')}>{t('finish')}</button>}
        </div>
        {saveError && <div className="error">{t('save_failed')}</div>}
        <div style={{ display: 'grid', gap: 8, marginTop: 24 }}>
          {idx < steps.length - 1 && <button className="btn" type="button" onClick={() => setConfirm('finish')}>{t('finish')}</button>}
          <button className="btn danger" type="button" onClick={() => setConfirm('discard')}>{t('discard')}</button>
        </div>
      </div>

      {active.restUntil && restLeft > 0 && (
        <div className="rest" role="timer" aria-live="polite">
          <div><div className="label">{t('resting')}</div><div className="clock">{fmtClock(Math.ceil(restLeft))}</div></div>
          <button className="btn small" type="button" onClick={() => onChange({ ...active, restUntil: (active.restUntil || Date.now()) + 15000 })}>{t('plus15')}</button>
          <button className="btn small primary" type="button" onClick={() => onChange({ ...active, restUntil: null })}>{t('skip')}</button>
        </div>
      )}

      <dialog ref={dialog} className="confirm" onClose={() => setConfirm(null)}>
        <h1 style={{ fontSize: 19 }}>{confirm === 'discard' ? t('confirm_discard') : t('confirm_finish')}</h1>
        <p className="muted" style={{ margin: 0 }}>{confirm === 'discard' ? t('confirm_discard_b') : t('confirm_finish_b', allDone, allSets)}</p>
        <div className="actions">
          {confirm === 'discard'
            ? <button className="btn danger" type="button" onClick={() => { setConfirm(null); onDiscard(); }}>{t('discard')}</button>
            : <button className="btn primary" type="button" disabled={saving} onClick={finish}>{saving ? t('saving') : t('finish')}</button>}
          <button className="btn" type="button" disabled={saving} onClick={() => setConfirm(null)}>{t('keep_going')}</button>
        </div>
      </dialog>
    </>
  );
}
