import { useMemo, useState } from 'react';
import { loadExerciseCards, loadRegions, type ExerciseCard } from '../lib/catalog';
import { useI18n } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { useLoad } from '../lib/useLoad';
import { Loading } from './Status';

const TYPES = ['strength', 'stretch', 'mobility', 'cardio'] as const;

// The list you build from: one row per exercise, with its picture, searchable and browsable by
// body region. It stays at exercise level on purpose — which variation it becomes is decided in
// the block, where the sets are, or later by the athlete's location.
export function ExerciseNav({ onPick }: { onPick: (card: ExerciseCard) => void }) {
  const { t, nm, lang } = useI18n();
  const { data, loading } = useLoad(async () => ({ cards: await loadExerciseCards(), regions: await loadRegions() }), []);
  const [term, setTerm] = useState('');
  const [type, setType] = useState<string>('strength');
  const [region, setRegion] = useState<string>('');

  const shown = useMemo(() => {
    const q = term.trim().toLowerCase();
    return (data?.cards || []).filter(c =>
      (!type || c.type === type)
      && (!region || c.region === region)
      && (!q || (c.names?.[lang] || c.names?.en || '').toLowerCase().includes(q) || c.exercise_id.includes(q)));
  }, [data, term, type, region, lang]);

  const regionsWith = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data?.cards || []) if (!type || c.type === type) counts.set(c.region || '', (counts.get(c.region || '') || 0) + 1);
    return (data?.regions || []).filter(r => counts.get(r.id));
  }, [data, type]);

  if (loading && !data) return <Loading />;

  return (
    <aside className="exnav">
      <input className="input" placeholder={t('search_exercises')} value={term} onChange={e => setTerm(e.target.value)} />
      <div className="chips" style={{ marginTop: 8 }}>
        {TYPES.map(ty => (
          <button key={ty} className="chip" type="button" aria-pressed={type === ty}
            onClick={() => { setType(type === ty ? '' : ty); setRegion(''); }}>{t(`extype_${ty}` as 'extype_strength')}</button>
        ))}
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        {regionsWith.map(r => (
          <button key={r.id} className="chip" type="button" aria-pressed={region === r.id}
            onClick={() => setRegion(region === r.id ? '' : r.id)}>{nm(r.names)}</button>
        ))}
      </div>

      <p className="sub" style={{ margin: '10px 0 4px' }}>{t('nav_hint', shown.length)}</p>
      <div className="exlist">
        {shown.map(c => (
          <button key={c.exercise_id} className="exrow" type="button" draggable
            onDragStart={e => {
              e.dataTransfer.setData('text/x-exercise', c.exercise_id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onPick(c)} title={t('nav_row_hint')}>
            <img src={mediaUrl(c.image_path)} alt="" loading="lazy" />
            <span>
              <span className="name">{nm(c.names)}</span>
              <span className="muted small">{c.variations > 1 ? t('variations_n', c.variations) : t('one_way')}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
