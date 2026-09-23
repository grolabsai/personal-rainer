// Turning prescribed sets into the short lines the athlete reads.
// Uniform sets collapse to "3 × 12 · 60 kg"; anything that varies is listed set by set, because a
// ramp (12/10/8) or a grip that changes every round is the point of the prescription, not noise.
import type { Item, PrescribedSet } from './types';
import type { Names, Translate as T } from './i18n';

export function repsPart(s: PrescribedSet, t: T): string {
  if (s.kind === 'amrap' && s.reps_min == null && s.duration_seconds == null) return t('amrap_short');
  if (s.duration_seconds != null) return `${s.duration_seconds} s`;
  const n = s.reps_max && s.reps_max !== s.reps_min ? `${s.reps_min}–${s.reps_max}` : `${s.reps_min}`;
  return s.reps_per_side ? `${n} ${t('per_side')}` : n;
}

export function loadPart(s: PrescribedSet, t: T): string {
  const bits: string[] = [];
  if (s.load_kg != null) bits.push(`${+s.load_kg} ${t('kg')}`);
  if (s.load_percent_1rm != null) bits.push(`${s.load_percent_1rm}% 1RM`);
  if (s.rpe != null) bits.push(`${t('rpe_short')} ${+s.rpe}`);
  if (s.tempo) bits.push(`${t('tempo_short')} ${s.tempo}`);
  return bits.join(' · ');
}

export const setLine = (s: PrescribedSet, t: T) => [repsPart(s, t), loadPart(s, t)].filter(Boolean).join(' · ');

// "Both hands" needs no words; the other four do.
export function sideLabel(s: PrescribedSet, t: T): string | null {
  const side = s.side === 'each' ? t('each_side')
    : s.side === 'alternating' ? t('alternating')
    : s.side === 'left' ? t('left')
    : s.side === 'right' ? t('right') : null;
  if (!side) return null;
  return s.other_side === 'hold' ? `${side} · ${t('other_holds')}` : side;
}

export const kindLabel = (s: PrescribedSet, t: T): string | null =>
  s.kind === 'warmup' ? t('kind_warmup')
    : s.kind === 'backoff' ? t('kind_backoff')
    : s.kind === 'drop' ? t('kind_drop')
    : s.kind === 'amrap' ? t('amrap_short') : null;

// One line for a whole exercise in a list: collapsed when every set is the same, listed when not.
export function itemSummary(item: Item, t: T): string {
  const sets = item.sets;
  if (!sets.length) return '';
  const lines = sets.map(s => setLine(s, t));
  const same = lines.every(l => l === lines[0]);
  if (same) return `${sets.length} × ${lines[0]}`;
  const reps = sets.map(s => repsPart(s, t));
  const loads = [...new Set(sets.map(s => loadPart(s, t)).filter(Boolean))];
  return `${sets.length} ${t('sets_word')} · ${reps.join(' / ')}${loads.length ? ` · ${loads.join(' / ')}` : ''}`;
}

// A per-set variation override is worth naming ("wide", then "diamond").
export const setVariantName = (s: PrescribedSet, item: Item, nm: (n: Names) => string): string | null =>
  s.variant && s.variant.id !== item.variant?.id ? nm(s.variant.names) : null;
