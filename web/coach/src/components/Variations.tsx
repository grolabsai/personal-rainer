import { useMemo } from 'react';
import { loadTypical, loadVariants, loadVariationOptions } from '../lib/catalog';
import { setItemAttribute, setItemEquipment, updateItem, type EditorItem } from '../lib/data';
import { useI18n, type Names } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { useLoad } from '../lib/useLoad';
import { Icon } from './Icon';
import { Loading } from './Status';

// How an exercise is done, decided next to its sets.
//
// Two rules the coach asked for, both answered from the catalog rather than from a fixed list:
// equipment comes first, because it is what a coach varies first; and every choice shows the value
// it will actually take — the typical variation's — instead of the word "any". A dimension the
// exercise never varies along is not shown at all, and one it varies along rarely sits behind
// "more ways", so the row you see first is the row that matters.
export function Variations({ item, dimensions, values, equipment, reload }: {
  item: EditorItem;
  dimensions: { id: string; names: Names }[];
  values: { dimension_id: string; value: string; names: Names }[];
  equipment: { id: string; names: Names }[];
  reload: () => void;
}) {
  const { t, nm } = useI18n();
  const { data, loading } = useLoad(async () => ({
    options: await loadVariationOptions(item.exercise_id),
    variants: await loadVariants(item.exercise_id),
    typical: await loadTypical(item.exercise_id),
  }), [item.exercise_id]);

  const chosenAttr = useMemo(
    () => Object.fromEntries(item.attributes.map(a => [a.dimension_id, a.value])),
    [item.attributes]);
  const chosenKit = item.equipment?.[0]?.equipment_id ?? '';

  // The typical variation is the catalog's own answer (exercise_display) — the same one whose
  // picture is on the card — so the defaults a coach reads here match what resolution will pick.
  const typical = useMemo(
    () => (data?.variants || []).find(v => v.id === data?.typical?.variant_id),
    [data]);

  const matching = useMemo(() => (data?.variants || []).filter(v =>
    Object.entries(chosenAttr).every(([d, val]) => v.attributes.some(a => a.dimension_id === d && a.value === val))
    && (!chosenKit || v.equipment.some(e => e.equipment_id === chosenKit))),
    [data, chosenAttr, chosenKit]);

  if (loading && !data) return <Loading />;
  const total = data!.variants.length;

  // Equipment options for this exercise, most used first; the typical one is the default.
  const kitCounts = new Map<string, number>();
  for (const v of data!.variants) for (const e of v.equipment) kitCounts.set(e.equipment_id, (kitCounts.get(e.equipment_id) || 0) + 1);
  const kitOptions = [...kitCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const defaultKit = typical?.equipment[0]?.equipment_id ?? kitOptions[0];

  const applicable = dimensions
    .map(d => {
      const vals = [...new Set(data!.options.filter(o => o.dimension_id === d.id).map(o => o.value))];
      const uses = data!.options.filter(o => o.dimension_id === d.id).reduce((n, o) => n + o.variants, 0);
      const onTypical = typical?.attributes.find(a => a.dimension_id === d.id)?.value;
      return { d, vals, uses, onTypical };
    })
    .filter(x => x.vals.length);
  // Shown first: what the typical variation states, and anything a quarter of the variations use.
  const primary = applicable.filter(x => x.onTypical || x.uses / Math.max(total, 1) >= 0.25);
  const secondary = applicable.filter(x => !primary.includes(x));

  const valueName = (d: string, v: string) => nm(values.find(x => x.dimension_id === d && x.value === v)?.names) || v;

  const dimensionRow = ({ d, vals, onTypical }: typeof applicable[number]) => (
    <label key={d.id} className="varfield">
      <span className="varlabel"><Icon name={`dim:${d.id}`} />{nm(d.names)}</span>
      <select value={chosenAttr[d.id] || ''}
        onChange={e => setItemAttribute(item.id, d.id, e.target.value || null).then(reload)}>
        <option value="">{onTypical ? `${valueName(d.id, onTypical)} · ${t('as_default')}` : `${t('standard')} · ${t('as_default')}`}</option>
        {vals.filter(v => v !== onTypical).map(v => <option key={v} value={v}>{valueName(d.id, v)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="variations">
      <div className="varfields">
        <label className="varfield">
          <span className="varlabel"><Icon name="dim:equipment" />{t('equipment')}</span>
          <select value={chosenKit} onChange={e => setItemEquipment(item.id, e.target.value || null).then(reload)}>
            <option value="">
              {defaultKit ? `${nm(equipment.find(e => e.id === defaultKit)?.names) || defaultKit} · ${t('as_default')}` : t('standard')}
            </option>
            {kitOptions.filter(id => id !== defaultKit).map(id => (
              <option key={id} value={id}>{nm(equipment.find(e => e.id === id)?.names) || id}</option>
            ))}
          </select>
        </label>
        {primary.map(dimensionRow)}
      </div>

      {!!secondary.length && (
        <details className="moreways">
          <summary>{t('more_ways', secondary.length)}</summary>
          <div className="varfields" style={{ marginTop: 8 }}>{secondary.map(dimensionRow)}</div>
        </details>
      )}

      <p className="sub" style={{ marginTop: 10 }}>
        {item.variant_locked ? t('locked_b') : t('open_b', matching.length)}
      </p>
      <div className="vargrid">
        <button type="button" className={`varcard ${item.variant_locked ? '' : 'on'}`}
          onClick={() => updateItem(item.id, { variant_locked: false }).then(reload)}>
          <span className="varany"><Icon name="ui:place" size={22} />{t('let_place_decide')}</span>
        </button>
        {matching.slice(0, 18).map(v => (
          <button key={v.id} type="button"
            className={`varcard ${item.variant_locked && item.variant_id === v.id ? 'on' : ''}`}
            onClick={() => updateItem(item.id, { variant_id: v.id, variant_locked: true }).then(reload)}>
            <img src={mediaUrl(v.image_path)} alt="" loading="lazy" />
            <span className="small">{nm(v.names)}</span>
            <span className="inline">{v.equipment.map(e => <Icon key={e.equipment_id} name={e.equipment_id} size={13} />)}</span>
          </button>
        ))}
      </div>
      {matching.length > 18 && <p className="sub">{t('more_variations', matching.length - 18)}</p>}
    </div>
  );
}
