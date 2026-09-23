import { useMemo } from 'react';
import { loadVariants, loadVariationOptions } from '../lib/catalog';
import { setItemAttribute, updateItem, type EditorItem } from '../lib/data';
import { useI18n, type Names } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import { useLoad } from '../lib/useLoad';
import { Loading } from './Status';

// Everything about *how* an exercise is done lives here, inside the block, so the list you drag
// from stays one row per exercise. Only the dimensions this exercise actually varies along are
// offered — a jump rope has no bench angle — and each one lists only the values the catalog holds.
export function Variations({ item, dimensions, values, reload }: {
  item: EditorItem;
  dimensions: { id: string; names: Names }[];
  values: { dimension_id: string; value: string; names: Names }[];
  reload: () => void;
}) {
  const { t, nm } = useI18n();
  const { data, loading } = useLoad(async () => ({
    options: await loadVariationOptions(item.exercise_id),
    variants: await loadVariants(item.exercise_id),
  }), [item.exercise_id]);

  const chosen = useMemo(
    () => Object.fromEntries(item.attributes.map(a => [a.dimension_id, a.value])),
    [item.attributes]);

  const matching = useMemo(() => (data?.variants || []).filter(v =>
    Object.entries(chosen).every(([d, val]) => v.attributes.some(a => a.dimension_id === d && a.value === val))),
    [data, chosen]);

  if (loading && !data) return <Loading />;
  const applicable = dimensions
    .map(d => ({ d, vals: [...new Set((data!.options).filter(o => o.dimension_id === d.id).map(o => o.value))] }))
    .filter(x => x.vals.length);

  return (
    <div className="variations">
      {!applicable.length
        ? <p className="sub">{t('no_variations')}</p>
        : (
          <>
            <p className="sub">{t('requires_b')}</p>
            <div className="inline">
              {applicable.map(({ d, vals }) => (
                <select key={d.id} value={chosen[d.id] || ''}
                  onChange={e => setItemAttribute(item.id, d.id, e.target.value || null).then(reload)}>
                  <option value="">{nm(d.names)}: {t('any')}</option>
                  {vals.map(v => (
                    <option key={v} value={v}>
                      {nm(d.names)}: {nm(values.find(x => x.dimension_id === d.id && x.value === v)?.names) || v}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </>
        )}

      <p className="sub" style={{ marginTop: 10 }}>
        {item.variant_locked ? t('locked_b') : t('open_b', matching.length)}
      </p>
      <div className="vargrid">
        <button type="button" className={`varcard ${item.variant_locked ? '' : 'on'}`}
          onClick={() => updateItem(item.id, { variant_locked: false }).then(reload)}>
          <span className="varany">{t('let_place_decide')}</span>
        </button>
        {matching.slice(0, 24).map(v => (
          <button key={v.id} type="button"
            className={`varcard ${item.variant_locked && item.variant_id === v.id ? 'on' : ''}`}
            onClick={() => updateItem(item.id, { variant_id: v.id, variant_locked: true }).then(reload)}>
            <img src={mediaUrl(v.image_path)} alt="" loading="lazy" />
            <span className="small">{nm(v.names)}</span>
          </button>
        ))}
      </div>
      {matching.length > 24 && <p className="sub">{t('more_variations', matching.length - 24)}</p>}
    </div>
  );
}
