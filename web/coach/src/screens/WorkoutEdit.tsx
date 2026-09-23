import { useEffect, useState } from 'react';
import {
  addBlock, addItem, addSet, deleteRow, loadDimensions, loadWorkout, searchExercises,
  setItemAttribute, updateBlock, updateItem, updateSet, updateWorkout,
  type EditorBlock, type EditorItem, type EditorSet,
} from '../lib/data';
import { useI18n, type Names } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { Failed, Loading } from '../components/Status';

const PURPOSES = ['warmup', 'main', 'accessory', 'finisher', 'cooldown'] as const;
const KINDS = ['warmup', 'working', 'backoff', 'drop', 'amrap'] as const;
const SIDES = ['both', 'each', 'alternating', 'left', 'right'] as const;

export function WorkoutEdit({ id }: { id: string }) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(() => loadWorkout(id), [id]);
  const vocab = useLoad(loadDimensions, []);

  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  if (!data) return <div className="empty">{t('nothing_yet')}</div>;

  return (
    <>
      <button className="link" type="button" onClick={() => go(`/program/${data.program_id}`)}>‹ {t('workouts')}</button>
      <div className="between">
        <h1>
          <input className="input" style={{ fontSize: 22, fontWeight: 700, border: 0, padding: 0, background: 'none' }}
            defaultValue={data.names?.en || ''}
            onBlur={e => updateWorkout(id, { names: { ...data.names, en: e.target.value } }).then(reload)} />
        </h1>
        <button className="btn" type="button"
          onClick={() => addBlock(id, (data.blocks.at(-1)?.position || 0) + 1).then(reload)}>{t('new_block')}</button>
      </div>

      {!data.blocks.length && <div className="empty">{t('nothing_yet')}</div>}
      {data.blocks.map(block => (
        <BlockCard key={block.id} block={block} workoutId={id} reload={reload}
          dimensions={vocab.data?.dimensions || []} values={vocab.data?.values || []} nm={nm} />
      ))}
    </>
  );
}

function BlockCard({ block, workoutId, reload, dimensions, values, nm }: {
  block: EditorBlock; workoutId: string; reload: () => void;
  dimensions: { id: string; names: Names }[]; values: { dimension_id: string; value: string; names: Names }[];
  nm: (n: Names) => string;
}) {
  const { t } = useI18n();
  const [picking, setPicking] = useState(false);
  const patch = (p: Record<string, unknown>) => updateBlock(block.id, p).then(reload);

  return (
    <div className="block-card">
      <div className="block-head">
        <select value={block.purpose} onChange={e => patch({ purpose: e.target.value })}>
          {PURPOSES.map(p => <option key={p} value={p}>{t(`purpose_${p}` as 'purpose_main')}</option>)}
        </select>
        <select value={block.mode}
          onChange={e => patch({ mode: e.target.value, rounds: e.target.value === 'rounds' ? (block.rounds || 3) : null })}>
          <option value="straight">{t('mode_straight')}</option>
          <option value="rounds">{t('mode_rounds')}</option>
        </select>
        {block.mode === 'rounds' && (
          <label className="inline small muted">{t('rounds')}
            <input className="input" type="number" min={1} max={30} style={{ width: 70 }}
              defaultValue={block.rounds ?? 3} onBlur={e => patch({ rounds: Number(e.target.value) })} /></label>
        )}
        <span className="grow" style={{ flex: 1 }} />
        <button className="btn mini danger" type="button"
          onClick={() => confirm(t('confirm_delete')) && deleteRow('workout_blocks', block.id).then(reload)}>×</button>
      </div>

      <div className="inline small muted" style={{ marginBottom: 8 }}>
        {block.mode === 'rounds' && (
          <>
            <label>{t('rest_items')}
              <input className="input mini" type="number" style={{ width: 70, marginLeft: 6 }}
                defaultValue={block.rest_between_items_s} onBlur={e => patch({ rest_between_items_s: Number(e.target.value) })} /></label>
            <label>{t('rest_rounds')}
              <input className="input mini" type="number" style={{ width: 70, marginLeft: 6 }}
                defaultValue={block.rest_between_rounds_s} onBlur={e => patch({ rest_between_rounds_s: Number(e.target.value) })} /></label>
          </>
        )}
        <label>{t('rest_after')}
          <input className="input mini" type="number" style={{ width: 70, marginLeft: 6 }}
            defaultValue={block.rest_after_s} onBlur={e => patch({ rest_after_s: Number(e.target.value) })} /></label>
      </div>

      {block.items.map(item => (
        <ItemCard key={item.id} item={item} block={block} reload={reload}
          dimensions={dimensions} values={values} nm={nm} />
      ))}

      {picking
        ? <ExercisePicker nm={nm} onPick={async ex => {
            setPicking(false);
            await addItem(workoutId, block.id, ex, (block.items.at(-1)?.position || 0) + 1);
            reload();
          }} onCancel={() => setPicking(false)} />
        : <button className="btn mini" type="button" onClick={() => setPicking(true)}>{t('add_exercise')}</button>}
    </div>
  );
}

function ItemCard({ item, block, reload, dimensions, values, nm }: {
  item: EditorItem; block: EditorBlock; reload: () => void;
  dimensions: { id: string; names: Names }[]; values: { dimension_id: string; value: string; names: Names }[];
  nm: (n: Names) => string;
}) {
  const { t } = useI18n();
  const attr = (d: string) => item.attributes.find(a => a.dimension_id === d)?.value || '';
  // In a rounds block a set is a round, so the count is fixed by the block.
  const wanted = block.mode === 'rounds' ? (block.rounds || item.sets.length) : item.sets.length;

  useEffect(() => {
    if (block.mode !== 'rounds' || item.sets.length >= wanted) return;
    (async () => {
      for (let n = item.sets.length + 1; n <= wanted; n++) await addSet(item.id, item.sets.at(-1), n);
      reload();
    })();
  }, [block.mode, wanted, item.sets, item.id, reload]);

  return (
    <div className="item-card">
      <div className="between">
        <span>
          <span className="name">{nm(item.exercise?.names) || item.exercise_id}</span>
          {item.variant && (
            <span className="muted small" style={{ display: 'block' }}>
              {nm(item.variant.names)}{item.variant_locked ? ` · ${t('lock_variation')}` : ''}
            </span>
          )}
        </span>
        <span className="inline">
          <label className="inline small muted">
            <input type="checkbox" checked={item.variant_locked}
              onChange={e => updateItem(item.id, { variant_locked: e.target.checked }).then(reload)} />
            {t('lock_variation')}
          </label>
          <button className="btn mini danger" type="button"
            onClick={() => confirm(t('confirm_delete')) && deleteRow('program_workout_items', item.id).then(reload)}>×</button>
        </span>
      </div>

      <div className="inline small" style={{ margin: '8px 0' }}>
        <span className="muted">{t('requires')}:</span>
        {dimensions.map(d => (
          <select key={d.id} value={attr(d.id)}
            onChange={e => setItemAttribute(item.id, d.id, e.target.value || null).then(reload)}>
            <option value="">{nm(d.names)}: {t('any')}</option>
            {values.filter(v => v.dimension_id === d.id).map(v => (
              <option key={v.value} value={v.value}>{nm(d.names)}: {nm(v.names)}</option>
            ))}
          </select>
        ))}
      </div>

      <SetsTable item={item} block={block} reload={reload} />
    </div>
  );
}

function SetsTable({ item, block, reload }: { item: EditorItem; block: EditorBlock; reload: () => void }) {
  const { t } = useI18n();
  const num = (v: string) => (v === '' ? null : Number(v));
  const cell = (set: EditorSet, field: keyof EditorSet, width = 68) => (
    <input className="input" type="number" style={{ width }} defaultValue={(set[field] as number) ?? ''}
      onBlur={e => updateSet(set.id, { [field]: num(e.target.value) }).then(reload)} />
  );

  return (
    <table className="settable">
      <thead>
        <tr>
          <th>{block.mode === 'rounds' ? t('rounds') : '#'}</th>
          <th>{t('set_kind')}</th><th>{t('reps')}</th><th>{t('reps_to')}</th><th>{t('secs')}</th>
          <th>{t('load')}</th><th>{t('rpe')}</th><th>{t('rest')}</th><th>{t('side')}</th><th>{t('other_side')}</th><th />
        </tr>
      </thead>
      <tbody>
        {item.sets.map(set => (
          <tr key={set.id}>
            <td className="mono">{set.set_number}</td>
            <td>
              <select value={set.kind} onChange={e => updateSet(set.id, { kind: e.target.value }).then(reload)}>
                {KINDS.map(k => <option key={k} value={k}>{t(`kind_${k}` as 'kind_working')}</option>)}
              </select>
            </td>
            <td>{cell(set, 'reps_min')}</td>
            <td>{cell(set, 'reps_max')}</td>
            <td>{cell(set, 'duration_seconds')}</td>
            <td>{cell(set, 'load_kg')}</td>
            <td>{cell(set, 'rpe', 56)}</td>
            <td>{cell(set, 'rest_seconds')}</td>
            <td>
              <select value={set.side} onChange={e => updateSet(set.id, { side: e.target.value }).then(reload)}>
                {SIDES.map(s => <option key={s} value={s}>{t(`side_${s}` as 'side_both')}</option>)}
              </select>
            </td>
            <td>
              <select value={set.other_side || ''} disabled={set.side === 'both'}
                onChange={e => updateSet(set.id, { other_side: e.target.value || null }).then(reload)}>
                <option value="">—</option>
                <option value="rest">{t('other_rest')}</option>
                <option value="hold">{t('other_hold')}</option>
                <option value="work">{t('other_work')}</option>
              </select>
            </td>
            <td>
              <span className="inline">
                <label className="small muted" title={t('per_side')}>
                  <input type="checkbox" checked={set.reps_per_side}
                    onChange={e => updateSet(set.id, { reps_per_side: e.target.checked }).then(reload)} />
                </label>
                {block.mode !== 'rounds' && (
                  <button className="btn mini danger" type="button"
                    onClick={() => deleteRow('item_sets', set.id).then(reload)}>×</button>
                )}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
      {block.mode !== 'rounds' && (
        <tfoot>
          <tr><td colSpan={11}>
            <button className="btn mini" type="button"
              onClick={() => addSet(item.id, item.sets.at(-1), item.sets.length + 1).then(reload)}>{t('add_set')}</button>
          </td></tr>
        </tfoot>
      )}
    </table>
  );
}

function ExercisePicker({ onPick, onCancel, nm }: {
  onPick: (exerciseId: string) => void; onCancel: () => void; nm: (n: Names) => string;
}) {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<{ id: string; names: Names; type: string }[]>([]);
  useEffect(() => {
    let live = true;
    const id = setTimeout(() => { searchExercises(term).then(r => live && setRows(r)); }, 150);
    return () => { live = false; clearTimeout(id); };
  }, [term]);

  return (
    <div className="pickers">
      <div className="inline">
        <input className="input" autoFocus placeholder={t('search_exercises')} style={{ maxWidth: 320 }}
          value={term} onChange={e => setTerm(e.target.value)} />
        <button className="btn mini" type="button" onClick={onCancel}>{t('cancel')}</button>
      </div>
      <div className="picklist">
        {rows.map(r => (
          <button key={r.id} type="button" onClick={() => onPick(r.id)}>
            {nm(r.names)} <span className="muted small">· {r.type}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
