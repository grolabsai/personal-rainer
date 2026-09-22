import { useEffect, useRef, useState } from 'react';
import { saveSession } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { fmtClock, isTimed } from '../lib/active';
import { go } from '../lib/router';
import type { ActiveSession, SetEntry, Workout } from '../lib/types';

type Props = {
  active: ActiveSession;
  workout: Workout;
  onChange: (a: ActiveSession) => void;
  onFinished: (sessionId: string) => void;
  onDiscard: () => void;
};

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

  const items = workout.items;
  const idx = Math.min(active.current, items.length - 1);
  const item = items[idx];
  // The athlete may be doing a substitute for this item; everything on screen follows that choice.
  const variant = active.swaps?.[item.id] || item.variant;
  const sets = active.sets[item.id] || [];
  const timed = isTimed(item.reps);
  const allSets = items.flatMap(it => active.sets[it.id] || []);
  const doneCount = allSets.filter(s => s.done).length;
  const exDone = (id: string) => (active.sets[id] || []).every(s => s.done);
  const elapsed = (now - new Date(active.startedAt).getTime()) / 1000;
  const restLeft = active.restUntil ? (active.restUntil - now) / 1000 : 0;

  const updateSet = (i: number, patch: Partial<SetEntry>) => {
    const next = sets.map((s, j) => (j === i ? { ...s, ...patch } : s));
    onChange({ ...active, sets: { ...active.sets, [item.id]: next } });
  };
  const toggle = (i: number) => {
    const becomingDone = !sets[i].done;
    const next = sets.map((s, j) => (j === i ? { ...s, done: becomingDone } : s));
    const lastOfAll = idx === items.length - 1 && next.every(s => s.done);
    onChange({
      ...active,
      sets: { ...active.sets, [item.id]: next },
      restUntil: becomingDone && !lastOfAll ? Date.now() + item.rest_seconds * 1000 : active.restUntil,
    });
  };
  const goTo = (i: number) => onChange({ ...active, current: Math.max(0, Math.min(items.length - 1, i)) });

  const finish = async () => {
    setSaving(true); setSaveError(false);
    try { onFinished(await saveSession(active, workout)); }
    catch { setSaveError(true); setSaving(false); setConfirm(null); }
  };

  return (
    <>
      <div className="player-top">
        <span className="clock" aria-label={t('duration')}>{fmtClock(elapsed)}</span>
        <span className="muted small">{t('exercise_of', idx + 1, items.length)}</span>
      </div>
      <div className="dots" role="tablist">
        {items.map((it, i) => (
          <button key={it.id} type="button" role="tab" aria-selected={i === idx} aria-label={nm(it.variant.names)}
            className={`dot ${exDone(it.id) ? 'done' : ''} ${i === idx ? 'current' : ''}`} onClick={() => goTo(i)} />
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="media-box"><img src={mediaUrl(variant.gif_path)} alt={nm(variant.names)} /></div>
        <h1 style={{ fontSize: 21 }}>{nm(variant.names)}</h1>
        <div className="muted small">{t('target', `${item.sets} × ${item.reps}`)} · {t('rest_s', item.rest_seconds)}</div>
        {active.swaps?.[item.id] && <div className="swapped"><span>{t('swapped_to', nm(variant.names))}</span></div>}
        <button className="link" type="button" style={{ padding: '6px 0' }}
          onClick={() => go(`/exercise/${variant.id}?item=${item.id}`)}>{t('details')} ›</button>
        {nm(item.notes) && <p className="small">{nm(item.notes)}</p>}

        <div className="set-head" style={{ marginTop: 14 }}>
          <span>{t('set')}</span><span>{timed ? 's' : t('reps')}</span><span>{t('weight')} ({t('kg')})</span><span />
        </div>
        <div className="sets">
          {sets.map((s, i) => (
            <div key={i} className={`set ${s.done ? 'done' : ''}`}>
              <span className="n">{i + 1}</span>
              <input className="input" inputMode="numeric" aria-label={`${t('set')} ${i + 1} ${timed ? 's' : t('reps')}`}
                value={s.reps} onChange={e => updateSet(i, { reps: e.target.value })} />
              <input className="input" inputMode="decimal" placeholder="—" aria-label={`${t('set')} ${i + 1} ${t('weight')}`}
                value={s.weight} onChange={e => updateSet(i, { weight: e.target.value })} />
              <button className="tick" type="button" aria-pressed={s.done} aria-label={`${t('set')} ${i + 1}`} onClick={() => toggle(i)}>✓</button>
            </div>
          ))}
        </div>

        {!!variant.instruction_steps?.[lang]?.length && (
          <details className="instructions">
            <summary>{t('instructions')}</summary>
            <ol>{(variant.instruction_steps[lang] || variant.instruction_steps.en || []).map((st, i) => <li key={i}>{st}</li>)}</ol>
          </details>
        )}

        <div className="player-nav">
          <button className="btn" type="button" disabled={idx === 0} onClick={() => goTo(idx - 1)}>{t('previous')}</button>
          {idx < items.length - 1
            ? <button className={`btn ${exDone(item.id) ? 'primary' : ''}`} type="button" onClick={() => goTo(idx + 1)}>{t('next')}</button>
            : <button className="btn primary" type="button" onClick={() => setConfirm('finish')}>{t('finish')}</button>}
        </div>
        {saveError && <div className="error">{t('save_failed')}</div>}
        <div style={{ display: 'grid', gap: 8, marginTop: 24 }}>
          {idx < items.length - 1 && <button className="btn" type="button" onClick={() => setConfirm('finish')}>{t('finish')}</button>}
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
        <p className="muted" style={{ margin: 0 }}>{confirm === 'discard' ? t('confirm_discard_b') : t('confirm_finish_b', doneCount, allSets.length)}</p>
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
