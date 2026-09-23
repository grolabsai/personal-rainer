import { useMemo, useState } from 'react';
import { loadEquipment, loadEquipmentByExercise, loadExerciseCards, loadRegions, type ExerciseCard } from '../lib/catalog';
import { useI18n } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { useLoad } from '../lib/useLoad';
import { HoverPreview, type Preview } from './HoverPreview';
import { Icon } from './Icon';
import { Loading } from './Status';

const TYPES = ['strength', 'stretch', 'mobility', 'cardio'] as const;

// The list you build from, filtered the way a coach thinks: the body part first, then what kind of
// work it is, then the equipment that part can be trained with. Each filter only offers what the
// ones before it leave on the table, so picking "shoulders" shows dumbbells, machines, bands and
// bodyweight — not the whole catalogue of kit.
export function ExerciseNav({ onPick }: { onPick: (card: ExerciseCard) => void }) {
  const { t, nm, lang } = useI18n();
  const { data, loading } = useLoad(async () => ({
    cards: await loadExerciseCards(),
    regions: await loadRegions(),
    byExercise: await loadEquipmentByExercise(),
    equipment: await loadEquipment(),
  }), []);
  const [term, setTerm] = useState('');
  const [region, setRegion] = useState('');
  const [type, setType] = useState('');
  const [equipment, setEquipment] = useState('');
  // Collapsed groups keep the list tall; a closed one still shows what is chosen inside it.
  const [open, setOpen] = useState<Record<string, boolean>>({ region: true, type: false, equipment: false });
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const [preview, setPreview] = useState<Preview>(null);

  const kitOf = (id: string) => data?.byExercise.get(id) ?? [];

  // Each step narrows the next, so the counts a coach sees are always real.
  const afterRegion = useMemo(
    () => (data?.cards || []).filter(c => !region || c.region === region),
    [data, region]);
  const afterType = useMemo(
    () => afterRegion.filter(c => !type || c.type === type),
    [afterRegion, type]);
  const shown = useMemo(() => {
    const q = term.trim().toLowerCase();
    return afterType
      .filter(c => !equipment || kitOf(c.exercise_id).includes(equipment))
      .filter(c => !q || (c.names?.[lang] || c.names?.en || '').toLowerCase().includes(q) || c.exercise_id.includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterType, equipment, term, lang, data]);

  const regionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data?.cards || []) if (c.region) m.set(c.region, (m.get(c.region) || 0) + 1);
    return m;
  }, [data]);
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of afterRegion) m.set(c.type, (m.get(c.type) || 0) + 1);
    return m;
  }, [afterRegion]);
  const equipmentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of afterType) for (const e of kitOf(c.exercise_id)) m.set(e, (m.get(e) || 0) + 1);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterType, data]);

  if (loading && !data) return <Loading />;

  const group = (key: string, label: string, chosen: React.ReactNode, children: React.ReactNode) => (
    <div className="filtergroup">
      <button className="filterhead" type="button" onClick={() => toggle(key)} aria-expanded={!!open[key]}>
        <span className="filterlabel">{label}</span>
        {!open[key] && chosen}
        <span className="chev">{open[key] ? '▴' : '▾'}</span>
      </button>
      {open[key] && <div className="chips">{children}</div>}
    </div>
  );

  // What a closed group is hiding: the choice made in it, or nothing at all.
  const chosenChip = (icon: string, label: string | undefined, clear: () => void) => label
    ? <span className="chosen"><Icon name={icon} size={13} />{label}
        <span className="clear" role="button" tabIndex={0} aria-label={t('cancel')}
          onClick={e => { e.stopPropagation(); clear(); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); clear(); } }}>×</span>
      </span>
    : <span className="chosen none">{t('all_of_them')}</span>;

  return (
    <aside className="exnav">
      <label className="searchbox">
        <Icon name="ui:search" />
        <input className="input" placeholder={t('search_exercises')} value={term} onChange={e => setTerm(e.target.value)} />
      </label>

      {group('region', t('f_body_part'),
        chosenChip(`region:${region}`, region ? nm(data!.regions.find(r => r.id === region)?.names) : undefined, () => setRegion('')),
        (data!.regions).filter(r => regionCounts.get(r.id)).map(r => (
        <button key={r.id} className="chip" type="button" aria-pressed={region === r.id}
          onClick={() => { setRegion(region === r.id ? '' : r.id); setEquipment(''); }}>
          <Icon name={`region:${r.id}`} />{nm(r.names)}
          <span className="count">{regionCounts.get(r.id)}</span>
        </button>
      )))}

      {group('type', t('f_kind'),
        chosenChip(`type:${type}`, type ? t(`extype_${type}` as 'extype_strength') : undefined, () => setType('')),
        TYPES.filter(ty => typeCounts.get(ty)).map(ty => (
        <button key={ty} className="chip" type="button" aria-pressed={type === ty}
          onClick={() => { setType(type === ty ? '' : ty); setEquipment(''); }}>
          <Icon name={`type:${ty}`} />{t(`extype_${ty}` as 'extype_strength')}
          <span className="count">{typeCounts.get(ty)}</span>
        </button>
      )))}

      {group('equipment', t('f_equipment'),
        chosenChip(equipment, equipment ? nm(data!.equipment.find(e => e.id === equipment)?.names) : undefined, () => setEquipment('')),
        data!.equipment
        .filter(e => equipmentCounts.get(e.id))
        .sort((a, b) => (equipmentCounts.get(b.id) || 0) - (equipmentCounts.get(a.id) || 0))
        .slice(0, region || type ? 40 : 12)   // the whole rack only once the part narrows it
        .map(e => (
          <button key={e.id} className="chip" type="button" aria-pressed={equipment === e.id}
            onClick={() => setEquipment(equipment === e.id ? '' : e.id)}>
            <Icon name={e.id} />{nm(e.names)}
            <span className="count">{equipmentCounts.get(e.id)}</span>
          </button>
        )))}

      <p className="sub navcount">{t('nav_hint', shown.length)}</p>
      <div className="exlist">
        {shown.map(c => (
          <button key={c.exercise_id} className="exrow" type="button" draggable
            onDragStart={e => {
              e.dataTransfer.setData('text/x-exercise', c.exercise_id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onPick(c)} title={t('nav_row_hint')}
            onMouseEnter={e => setPreview({
              name: nm(c.names), gif: c.gif_path, top: e.currentTarget.getBoundingClientRect().top,
              sub: c.variations > 1 ? t('variations_n', c.variations) : t('one_way'),
            })}
            onMouseLeave={() => setPreview(null)}
            onFocus={e => setPreview({ name: nm(c.names), gif: c.gif_path, top: e.currentTarget.getBoundingClientRect().top })}
            onBlur={() => setPreview(null)}>
            <img src={mediaUrl(c.image_path)} alt="" loading="lazy" />
            <span>
              <span className="name">{nm(c.names)}</span>
              <span className="exkit">
                <Icon name={`type:${c.type}`} size={13} />
                {kitOf(c.exercise_id).slice(0, 4).map(e => <Icon key={e} name={e} size={13} />)}
                <span className="muted small">{c.variations > 1 ? t('variations_n', c.variations) : t('one_way')}</span>
              </span>
            </span>
            <Icon name="ui:drag" size={14} />
          </button>
        ))}
      </div>
      <HoverPreview preview={preview} />
    </aside>
  );
}
