import { useMemo, useState } from 'react';
import { loadExerciseDetail, loadSubstitutes, saveMyEquipment } from '../lib/data';
import { supabase } from '../lib/supabase';
import { useI18n, type Names } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { useLoad } from '../lib/useLoad';
import type { MuscleRow, Substitute, Variant } from '../lib/types';
import { BodyMap, viewsForBoth, type States } from '../components/BodyMap';
import { EquipmentIcon, EquipmentPills } from '../components/Equipment';
import { Failed, Loading } from '../components/Status';

// The word an athlete uses ("Upper chest") before the anatomical one ("Clavicular head").
const muscleName = (row: MuscleRow | undefined, nm: (n: Names) => string) =>
  row ? (nm(row.muscle?.common_names) || nm(row.muscle?.names)) : '';

// Weakest role first, strongest last: a muscle claimed twice should read as the strongest claim.
const statesOf = (rows: MuscleRow[]): States => Object.fromEntries([
  ...rows.filter(r => r.role === 'stabiliser').map(r => [r.muscle_id, 'stabiliser'] as const),
  ...rows.filter(r => r.role === 'secondary').map(r => [r.muscle_id, 'secondary'] as const),
  ...rows.filter(r => r.role === 'target').map(r => [r.muscle_id, 'primary'] as const),
]);

export function ExerciseDetail({ id, itemId, onSwap, swapped }: {
  id: string;
  itemId: string | null;                                    // the planned item this stands in for
  onSwap: ((itemId: string, variant: Variant | null) => void) | null;
  swapped: Variant | null;
}) {
  const { t, nm, lang } = useI18n();
  const { data, error, loading, reload } = useLoad(() => loadExerciseDetail(id), [id]);
  const [mine, setMine] = useState<string[] | null>(null);
  const [subs, setSubs] = useState<Substitute[] | null>(null);
  const [savingKit, setSavingKit] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  if (!data) return <div className="empty">{t('not_found')}</div>;

  const { variant } = data;
  const have = new Set(mine ?? data.mine);
  const options = subs ?? data.substitutes;
  const eqNames = Object.fromEntries(data.equipment.map(e => [e.id, e.names])) as Record<string, Names>;
  const kit = (variant.equipment || []).map(e => e.equipment.id);
  const missing = have.size ? kit.filter(k => !have.has(k)) : [];
  const planned = statesOf(data.muscles);
  const mName = (mid: string, rows: MuscleRow[]) => muscleName(rows.find(r => r.muscle_id === mid), nm) || mid;

  const byRole = (role: MuscleRow['role']) => data.muscles
    .filter(m => m.role === role).map(m => muscleName(m, nm) || m.muscle_id).join(', ');
  // Rules that made the data more precise explain themselves in the athlete's language.
  const inferred = data.muscles.filter(m => m.detail_level === 'inferred' && m.notes).map(m => nm(m.notes));

  // Changing the kit changes what can be offered, so the list is reloaded with it.
  const toggleKit = async (eid: string) => {
    const next = have.has(eid) ? [...have].filter(x => x !== eid) : [...have, eid];
    setMine(next); setSavingKit(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await saveMyEquipment(user.id, next);
      setSubs(await loadSubstitutes(id, next));
    } catch { /* the list on screen still matches what was picked */ }
    setSavingKit(false);
  };

  return (
    <>
      <div className="media-box"><img src={mediaUrl(variant.gif_path)} alt={nm(variant.names)} /></div>
      <h1 style={{ fontSize: 21 }}>{nm(variant.names)}</h1>
      <div className="pills" style={{ marginTop: 8 }}>
        <EquipmentPills ids={kit} names={eqNames} have={have.size ? have : null} />
      </div>
      {!!missing.length && (
        <div className="error">{t('missing_equipment', missing.map(k => nm(eqNames[k]) || k).join(' · '))}</div>
      )}
      {swapped && itemId && onSwap && (
        <div className="swapped">
          <span>{t('swapped_to', nm(swapped.names))}</span>
          <button className="link" type="button" onClick={() => onSwap(itemId, null)}>{t('undo_swap')}</button>
        </div>
      )}

      <h2>{t('muscles_worked')}</h2>
      <BodyMap states={planned} width={140} title={nm(variant.names)} />
      <div className="maplegend">
        {byRole('target') && <span><i className="sw primary" />{t('primary_m')}: {byRole('target')}</span>}
        {byRole('secondary') && <span><i className="sw secondary" />{t('secondary_m')}: {byRole('secondary')}</span>}
        {byRole('stabiliser') && <span><i className="sw stabiliser" />{t('stabiliser_m')}: {byRole('stabiliser')}</span>}
      </div>
      {!!inferred.length && (
        <div className="changes">
          <span className="h">{t('why_inferred')}</span>
          <ul>{inferred.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      {!!variant.instruction_steps?.[lang]?.length && (
        <details className="instructions">
          <summary>{t('instructions')}</summary>
          <ol>{(variant.instruction_steps[lang] || variant.instruction_steps.en || []).map((st, i) => <li key={i}>{st}</li>)}</ol>
        </details>
      )}

      <h2>{t('swap_title')}</h2>
      <p className="sub">{options.length ? t('swap_sub', options.length) : t('swap_none')}</p>
      {([1, 2, 3] as const).map(level => {
        const rows = options.filter(o => o.level === level);
        if (!rows.length) return null;
        return (
          <div key={level} className="level">
            <h3 className="lvl">{t(`l${level}_t` as 'l1_t')}</h3>
            <p className="sub">{t(`l${level}_s` as 'l1_s')}</p>
            {rows.map(o => (
              <Option key={o.variant_id} o={o} planned={planned} plannedRows={data.muscles} eqNames={eqNames}
                have={have.size ? have : null} mName={mName}
                onUse={onSwap && itemId ? () => onSwap(itemId, {
                  id: o.variant_id, exercise_id: o.exercise_id, names: o.names as Names,
                  image_path: o.image_path || '', gif_path: '', instruction_steps: {},
                  equipment: o.equipment_ids.map(e => ({ equipment: { id: e, names: eqNames[e] } })),
                } as Variant) : null} />
            ))}
          </div>
        );
      })}

      <h2>{t('my_equipment')}</h2>
      <p className="sub">{have.size ? t('my_equipment_sub') : t('my_equipment_none')}</p>
      <div className="chips" aria-busy={savingKit}>
        {data.equipment.map(e => (
          <button key={e.id} className="chip" type="button" aria-pressed={have.has(e.id)}
            onClick={() => toggleKit(e.id)}>
            <EquipmentIcon id={e.id} />{nm(e.names)}
          </button>
        ))}
      </div>
    </>
  );
}

function Option({ o, planned, plannedRows, eqNames, have, mName, onUse }: {
  o: Substitute; planned: States; plannedRows: MuscleRow[];
  eqNames: Record<string, Names>; have: Set<string> | null;
  mName: (id: string, rows: MuscleRow[]) => string;
  onUse: (() => void) | null;
}) {
  const { t, nm } = useI18n();
  const rows = o.muscles || [];
  const theirs = useMemo(() => statesOf(rows), [rows]);
  const views = useMemo(() => viewsForBoth(planned, theirs), [planned, theirs]);
  const all = [...plannedRows, ...rows];

  // Why this one is offered: the attribute that differs, or how far the match reaches.
  const why = o.level === 3
    ? t(`basis_${o.basis as 'pattern'}`)
    : o.changes.map(c => {
      const dim = nm(c.dimension_names);
      if (c.from && c.to) return t('change_from', dim, nm(c.from_names), nm(c.to_names));
      if (c.to) return t('change_to', dim, nm(c.to_names));
      return t('change_drop', dim, nm(c.from_names));
    }).join(' · ');

  // What it does to the body: the muscles that move, then the sentence a rule already carries.
  // A rule says it better than a generated line, so muscles it covers are left to it.
  const lines: string[] = [];
  const said = new Set((o.notes || []).map(n => n.muscle_id).filter(Boolean));
  const names = (ids?: string[]) => (ids || []).filter(m => !said.has(m)).map(m => mName(m, all)).join(', ');
  const d = o.muscle_delta || {};
  const add = (key: 'promotes_m' | 'demotes_m' | 'adds_m' | 'drops_m', ids?: string[]) => {
    const list = names(ids);
    if (list) lines.push(t(key, list));
  };
  add('promotes_m', d.promoted); add('demotes_m', d.demoted); add('adds_m', d.added);
  // Within one exercise a missing muscle is almost always a gap in the dataset rather than a real
  // difference — a partial-range bench press still works the chest — so only a different exercise
  // is allowed to say it drops one.
  if (o.level === 3) add('drops_m', d.dropped);
  for (const n of o.notes || []) lines.push(nm(n));

  return (
    <div className="opt">
      <img src={mediaUrl(o.image_path)} alt="" loading="lazy" />
      <div>
        <span className="nm">{nm(o.names)}</span>
        {why && <span className="why">{why}</span>}
        <span className="eqs"><EquipmentPills ids={o.equipment_ids} names={eqNames} have={have} /></span>
        {!lines.length
          ? <div className="changes"><span className="same">{t('same_muscles')}</span></div>
          : (
            <div className="changes">
              <span className="h">{t('what_changes')}</span>
              <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
        {o.level !== 1 && !!rows.length && (
          <details className="compare">
            <summary>{t('compare_body')}</summary>
            <div className="compare-grid">
              <div><h4>{t('planned_m')}</h4><BodyMap states={planned} width={104} labels={false} views={views} /></div>
              <div><h4>{t('this_option')}</h4><BodyMap states={theirs} width={104} labels={false} views={views} /></div>
            </div>
          </details>
        )}
        {onUse && <button className="btn small" type="button" style={{ marginTop: 8 }} onClick={onUse}>{t('use_this')}</button>}
      </div>
      <span className={`badge l${o.level}`}>{t(`l${o.level}_b` as 'l1_b')}</span>
    </div>
  );
}
