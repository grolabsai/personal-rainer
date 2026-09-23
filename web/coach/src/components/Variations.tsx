import { useMemo, useState } from 'react';
import { loadTypical, loadVariants, type VariantCard } from '../lib/catalog';
import { setItemAttribute, setItemEquipment, updateItem, type EditorItem } from '../lib/data';
import { familyOf } from '../shared/variation-language.js';
import { useI18n, type Names } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { useLoad } from '../lib/useLoad';
import { differingFamilies } from '../shared/variation-language.js';
import { HoverPreview, previewAt, type Preview } from './HoverPreview';
import { Icon } from './Icon';
import { VariantName } from './VariantName';
import { Loading } from './Status';

// The plainest variation that still satisfies the constraints: fewest extra attributes, then the
// smallest kit. The same rule the resolver uses on the server, so what a coach sees previewed here
// is what the athlete's place will pick.
// Body position and angle share a row and a colour: one fact, two parts.
const POSTURE = ['position', 'bench_angle'];

type Pill = { key: string; icon: string; label: string; on: boolean; explicit: boolean; choose: () => void };

function bestMatch(variants: VariantCard[]) {
  return [...variants].sort((a, b) =>
    a.attributes.length - b.attributes.length
    || a.equipment.length - b.equipment.length
    || a.id.localeCompare(b.id))[0];
}

// How an exercise is done, decided next to its sets.
//
// Two rules the coach asked for, both answered from the catalog rather than from a fixed list:
// equipment comes first, because it is what a coach varies first; and every choice shows the value
// it will actually take — the typical variation's — instead of the word "any". A dimension the
// exercise never varies along is not shown at all, and one it varies along rarely sits behind
// "more ways", so the row you see first is the row that matters.
//
// The choices are pills, not dropdowns, for the same reason the filters are: a closed dropdown
// hides the alternatives, and here the alternatives are the point — the pictures below change as
// you press one, and the picture on the card above changes with them.
export function Variations({ item, exercise, dimensions, values, equipment, reload, store }: {
  item: EditorItem;
  exercise: Names;
  dimensions: { id: string; names: Names }[];
  values: { dimension_id: string; value: string; names: Names }[];
  equipment: { id: string; names: Names; sort_order?: number }[];
  reload: () => void;
  // The three writes this panel makes, so the dev harness can drive it without a coach session.
  store?: { setEquipment: typeof setItemEquipment; setAttribute: typeof setItemAttribute; update: typeof updateItem };
}) {
  const { setEquipment, setAttribute, update } =
    store ?? { setEquipment: setItemEquipment, setAttribute: setItemAttribute, update: updateItem };
  const { t, nm } = useI18n();
  const { data, loading } = useLoad(async () => ({
    variants: await loadVariants(item.exercise_id),
    typical: await loadTypical(item.exercise_id),
  }), [item.exercise_id]);
  const [preview, setPreview] = useState<Preview>(null);

  const chosenAttr = useMemo(
    () => Object.fromEntries(item.attributes.map(a => [a.dimension_id, a.value])),
    [item.attributes]);
  const chosenKit = item.equipment?.[0]?.equipment_id ?? '';

  // The typical variation is the catalog's own answer (exercise_display) — the same one whose
  // picture is on the card — so the defaults a coach reads here match what resolution will pick.
  const typical = useMemo(
    () => (data?.variants || []).find(v => v.id === data?.typical?.variant_id),
    [data]);

  const fits = (v: VariantCard, attrs: Record<string, string>, kit: string) =>
    Object.entries(attrs).every(([d, val]) => v.attributes.some(a => a.dimension_id === d && a.value === val))
    && (!kit || v.equipment.some(e => e.equipment_id === kit));

  const matching = useMemo(
    () => (data?.variants || []).filter(v => fits(v, chosenAttr, chosenKit)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, chosenAttr, chosenKit]);

  if (loading && !data) return <Loading />;
  // What the shown variations have in common is dimmed; what differs keeps its colour.
  const differing = differingFamilies(matching);
  const shared = new Set(
    [...new Set(matching.flatMap(v => [
      'equipment', ...v.attributes.map(a => `attr:${a.dimension_id}`)]))].filter(k => !differing.has(k)));
  const differs = [...differing];

  // The rows narrow each other, and they do it strictly downwards. Row by row from the top:
  // equipment first, then what each choice leaves possible below it. Choose Bodyweight for a bench
  // press and there is no bench left to angle, so the Angle row goes away; choose Barbell and it
  // comes back.
  //
  // A row is never narrowed by anything *beneath* it. Reading both ways looked tidier but made
  // rows vanish above the one being used — pick "On the floor" and the whole equipment row would
  // disappear, because only one kit does floor presses. Nothing above where you are clicking
  // should ever move: it is what you would use to change your mind.
  const ladder = ['equipment', ...dimensions.map(d => d.id)];
  const above = (id: string) => {
    const rank = ladder.indexOf(id);
    return data!.variants.filter(v => fits(v,
      Object.fromEntries(Object.entries(chosenAttr).filter(([d]) => {
        const i = ladder.indexOf(d);
        return i !== -1 && i < rank;
      })),
      rank > 0 ? chosenKit : ''));
  };

  const kitCounts = new Map<string, number>();
  for (const v of above('equipment')) for (const e of v.equipment) kitCounts.set(e.equipment_id, (kitCounts.get(e.equipment_id) || 0) + 1);
  const kitOptions = [...kitCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  // The variation the item is right now — the one in the picture above. Every pill lights from
  // this rather than from what has been insisted on, so the row always describes the exercise on
  // screen instead of describing the requirements that led to it.
  const current = data!.variants.find(v => v.id === item.variant_id) ?? typical;
  const currentValue = (d: string) => current?.attributes.find(a => a.dimension_id === d)?.value ?? '';
  // Which of its kit is *the* equipment: the implement, not the furniture. The catalog's own order
  // answers it — a bench press is a barbell exercise that also needs a bench.
  const rank = (id: string) => equipment.find(e => e.id === id)?.sort_order ?? 999;
  const defaultKit = [...(current?.equipment ?? [])]
    .sort((a, b) => rank(a.equipment_id) - rank(b.equipment_id))[0]?.equipment_id ?? kitOptions[0];

  const applicable = dimensions
    .map(d => {
      const pool = above(d.id);
      const vals = [...new Set(pool.flatMap(v => v.attributes.filter(a => a.dimension_id === d.id).map(a => a.value)))];
      const onTypical = typical?.attributes.find(a => a.dimension_id === d.id)?.value;
      // Saying nothing is itself one of the answers: most jump squats state no position and one
      // says "kneeling", so there are two ways to do it even though only one value is listed.
      const stated = pool.filter(v => v.attributes.some(a => a.dimension_id === d.id)).length;
      const plain = stated < pool.length;
      return { d, vals, onTypical, plain, choices: vals.length + (plain ? 1 : 0) };
    })
    // A row is worth its height only if there is a choice in it. One way is not a choice: a jump
    // rope has no grip to pick and a chin-up has one body position, so those rows are simply absent
    // rather than showing a control that cannot be moved.
    .filter(x => x.choices > 1);
  // Body position and angle are one fact — the posture, and how far it is tilted — so they become
  // one row before anything decides which rows are shown first. Folding them afterwards lost the
  // angle whenever the two landed on opposite sides of that line.
  const groups = applicable
    .filter(x => x.d.id !== 'bench_angle' || !applicable.some(y => y.d.id === 'position'))
    .map(x => ({
      lead: x,
      parts: x.d.id === 'position' ? applicable.filter(y => POSTURE.includes(y.d.id)) : [x],
    }));


  const valueName = (d: string, v: string) => nm(values.find(x => x.dimension_id === d && x.value === v)?.names) || v;

  // Narrowing the choice also moves the item to the variation it now means, so the thumbnail on
  // the card above is always the exercise as currently described. It does not lock it: that is
  // still a deliberate click on a picture.
  const settle = async (attrs: Record<string, string>, kit: string) => {
    // Nothing insisted on means back to the typical variation — the catalog's own answer, not
    // whichever variation happens to sort first.
    const pick = !kit && !Object.keys(attrs).length
      ? typical : bestMatch(data!.variants.filter(v => fits(v, attrs, kit)));
    if (pick && pick.id !== item.variant_id) await update(item.id, { variant_id: pick.id });
  };
  // Because the upper rows keep offering everything, a choice up there can contradict one made
  // further down — barbell, when "on the floor" is still set from before. The upper row wins and
  // the contradicted choice below it is dropped, which is the same order of authority the rows are
  // read in. Walking the ladder downwards keeps whatever still stands.
  const prune = async (attrs: Record<string, string>, kit: string) => {
    const kept: Record<string, string> = {};
    for (const id of ladder.slice(1)) {
      if (!(id in attrs)) continue;
      if (data!.variants.some(v => fits(v, { ...kept, [id]: attrs[id] }, kit))) kept[id] = attrs[id];
      else await setAttribute(item.id, id, null);
    }
    return kept;
  };

  const pickKit = async (id: string) => {
    const next = id === chosenKit ? '' : id;
    await setEquipment(item.id, next || null);
    await settle(await prune(chosenAttr, next), next);
    reload();
  };
  const pickValue = async (dimension: string, value: string) => {
    const next = value === chosenAttr[dimension] ? '' : value;
    await setAttribute(item.id, dimension, next || null);
    const attrs = { ...chosenAttr };
    if (next) attrs[dimension] = next; else delete attrs[dimension];
    await settle(await prune(attrs, chosenKit), chosenKit);
    reload();
  };

  // One dimension's pills. The row is coloured by the family the dimension belongs to, so the pill
  // you press is the same colour as the word it puts into the name.
  //
  // The catalog names only the departures: a single-leg squat says "single leg" and an ordinary one
  // says nothing at all. Left as it was, the row offered "Single leg" and no way back — one pill,
  // reading as a fact rather than a choice. Saying nothing is the other option, so it gets a pill
  // of its own, named for what it means: both legs, a standard grip, no named technique.
  const pills = ({ d, vals, plain }: typeof applicable[number]): Pill[] => [
    ...(plain ? [{ value: '', label: t(`plain_${d.id}` as 'plain_laterality') }] : []),
    ...vals.map(v => ({ value: v, label: valueName(d.id, v) })),
  ].map(o => ({
    key: `${d.id}:${o.value}`, icon: `dim:${d.id}`, label: o.label,
    on: currentValue(d.id) === o.value,
    explicit: (chosenAttr[d.id] ?? '') === o.value && o.value !== '',
    choose: () => pickValue(d.id, o.value),
  }));

  const pillRow = (key: string, family: string, icon: string, label: string, opts: Pill[]) => (
    <div className={`varrow f-${family}`} key={key}>
      <span className="varlabel"><Icon name={icon} />{label}</span>
      <div className="chips">
        {opts.map(o => (
          <button key={o.key} type="button" className={`chip${o.on && !o.explicit ? ' dflt' : ''}`}
            aria-pressed={o.on} onClick={o.choose}>
            <Icon name={o.icon} size={13} />
            {o.label}
            {o.on && !o.explicit && <span className="count">{t('as_default')}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  const dimensionRow = ({ lead, parts }: typeof groups[number]) =>
    pillRow(lead.d.id, familyOf(lead.d.id), `dim:${lead.d.id}`, nm(lead.d.names), parts.flatMap(pills));

  return (
    <div className="variations">
      {kitOptions.length > 1 && pillRow('equipment', 'equipment', 'dim:equipment', t('equipment'),
        kitOptions.map(id => ({
          key: id, icon: id, label: nm(equipment.find(e => e.id === id)?.names) || id,
          on: defaultKit === id, explicit: chosenKit === id,
          choose: () => pickKit(id),
        })))}
      {groups.map(dimensionRow)}

      <p className="sub varcount">
        {item.variant_locked ? t('locked_b') : t('open_b', matching.length)}
        {matching.length > 1 && differs.length > 0 && (
          <> · {t('what_differs')} <span className="inline">{differs.map(f => (
            <span key={f} className={`vpart f-${f === 'equipment' ? 'equipment' : familyOf(f.replace('attr:', ''))}`}>
              {f === 'equipment' ? t('equipment')
                : nm(dimensions.find(d => d.id === f.replace('attr:', ''))?.names) || f}
            </span>))}</span></>
        )}
        {item.variant_locked && (
          <button className="link unlock" type="button"
            onClick={() => update(item.id, { variant_locked: false }).then(reload)}>{t('unlock')}</button>
        )}
      </p>

      <div className="vargrid" onMouseLeave={() => setPreview(null)}>
        {matching.slice(0, 18).map(v => (
          <button key={v.id} type="button"
            className={`varcard${item.variant_id === v.id ? ' on' : ''}${item.variant_locked && item.variant_id === v.id ? ' locked' : ''}`}
            title={item.variant_id === v.id && !item.variant_locked ? t('lock_variation') : undefined}
            onMouseEnter={e => setPreview(previewAt(e.currentTarget, { name: nm(v.names), gif: v.gif_path }))}
            onClick={() => update(item.id, { variant_id: v.id, variant_locked: true }).then(reload)}>
            {item.variant_id === v.id && (
              <span className="varmark">
                <Icon name={item.variant_locked ? 'ui:lock' : 'ui:plus'} size={12} />
                {item.variant_locked ? t('locked_short') : t('current')}
              </span>
            )}
            <img src={mediaUrl(v.image_path)} alt="" loading="lazy" />
            <VariantName small parts={{ exercise, attributes: v.attributes, equipment: v.equipment }}
              values={values} equipment={equipment} same={shared} />
          </button>
        ))}
      </div>
      {matching.length > 18 && <p className="sub">{t('more_variations', matching.length - 18)}</p>}
      <HoverPreview preview={preview} />
    </div>
  );
}
