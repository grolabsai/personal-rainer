import { useEffect, useState } from 'react';
import {
  addBlock, addItem, addSet, deleteRow, loadDimensions, loadWorkout, updateBlock,
  updateSet, updateWorkout, type EditorBlock, type EditorItem, type EditorSet,
} from '../lib/data';
import { useI18n } from '../lib/i18n';
import { go } from '../lib/router';
import { mediaUrl } from '../lib/media';
import { useLoad } from '../lib/useLoad';
import { ExerciseNav } from '../components/ExerciseNav';
import { Variations } from '../components/Variations';
import { Failed, Loading } from '../components/Status';

const PURPOSES = ['warmup', 'main', 'accessory', 'finisher', 'cooldown'] as const;
const KINDS = ['warmup', 'working', 'backoff', 'drop', 'amrap'] as const;
const SIDES = ['both', 'each', 'alternating', 'left', 'right'] as const;

export function WorkoutEdit({ id }: { id: string }) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(() => loadWorkout(id), [id]);
  const vocab = useLoad(loadDimensions, []);
  // Dropping needs a target; clicking a row in the list needs one too, so touch and keyboard work.
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => { if (data?.blocks.length && !active) setActive(data.blocks[0].id); }, [data, active]);

  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  if (!data) return <div className="empty">{t('nothing_yet')}</div>;

  // Dragging an exercise into an empty workout should just work, so the first block is made here.
  const drop = async (blockId: string | null, exerciseId: string) => {
    let target = blockId;
    if (!target) {
      target = await addBlock(id, (data.blocks.at(-1)?.position || 0) + 1);
      setActive(target);
    }
    const block = data.blocks.find(b => b.id === target);
    await addItem(id, target, exerciseId, (block?.items.at(-1)?.position || 0) + 1);
    reload();
  };

  return (
    <div className="builder">
      <ExerciseNav onPick={c => drop(active, c.exercise_id)} />

      <div>
        <button className="link" type="button" onClick={() => go(`/program/${data.program_id}`)}>‹ {t('workouts')}</button>
        <div className="between">
          <input className="input titlefield" defaultValue={data.names?.en || ''}
            onBlur={e => updateWorkout(id, { names: { ...data.names, en: e.target.value } }).then(reload)} />
          <button className="btn" type="button"
            onClick={() => addBlock(id, (data.blocks.at(-1)?.position || 0) + 1).then(reload)}>{t('new_block')}</button>
        </div>

        {!data.blocks.length && (
          <div className="dayslot" style={{ marginTop: 12 }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const ex = e.dataTransfer.getData('text/x-exercise'); if (ex) drop(null, ex); }}>
            {t('no_blocks')}
          </div>
        )}
        {data.blocks.map(block => (
          <BlockCard key={block.id} block={block} active={active === block.id}
            onActivate={() => setActive(block.id)} onDropExercise={ex => drop(block.id, ex)}
            reload={reload} dimensions={vocab.data?.dimensions || []} values={vocab.data?.values || []} nm={nm} />
        ))}
      </div>
    </div>
  );
}

function BlockCard({ block, active, onActivate, onDropExercise, reload, dimensions, values, nm }: {
  block: EditorBlock; active: boolean; onActivate: () => void; onDropExercise: (exerciseId: string) => void;
  reload: () => void;
  dimensions: { id: string; names: import('../lib/i18n').Names }[];
  values: { dimension_id: string; value: string; names: import('../lib/i18n').Names }[];
  nm: (n: import('../lib/i18n').Names) => string;
}) {
  const { t } = useI18n();
  const [over, setOver] = useState(false);
  const patch = (p: Record<string, unknown>) => updateBlock(block.id, p).then(reload);

  return (
    <section className={`block-card ${active ? 'target' : ''} ${over ? 'over' : ''}`}
      onClick={onActivate}
      onDragOver={e => { if (e.dataTransfer.types.includes('text/x-exercise')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault(); setOver(false);
        const ex = e.dataTransfer.getData('text/x-exercise');
        if (ex) onDropExercise(ex);
      }}>
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
            <input className="input mini" type="number" min={1} max={30} style={{ width: 70 }}
              defaultValue={block.rounds ?? 3} onBlur={e => patch({ rounds: Number(e.target.value) })} /></label>
        )}
        <span style={{ flex: 1 }} />
        {active && <span className="badge l1">{t('drop_here')}</span>}
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

      {!block.items.length && <p className="sub">{t('drag_here')}</p>}
      {block.items.map(item => (
        <ItemCard key={item.id} item={item} block={block} reload={reload}
          dimensions={dimensions} values={values} nm={nm} />
      ))}
    </section>
  );
}

function ItemCard({ item, block, reload, dimensions, values, nm }: {
  item: EditorItem; block: EditorBlock; reload: () => void;
  dimensions: { id: string; names: import('../lib/i18n').Names }[];
  values: { dimension_id: string; value: string; names: import('../lib/i18n').Names }[];
  nm: (n: import('../lib/i18n').Names) => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wanted = block.mode === 'rounds' ? (block.rounds || item.sets.length) : item.sets.length;

  // In a rounds block a set is a round, so the count follows the block rather than being edited.
  useEffect(() => {
    if (block.mode !== 'rounds' || item.sets.length >= wanted) return;
    (async () => {
      for (let n = item.sets.length + 1; n <= wanted; n++) await addSet(item.id, item.sets.at(-1), n);
      reload();
    })();
  }, [block.mode, wanted, item.sets, item.id, reload]);

  const attrText = item.attributes.map(a =>
    nm(values.find(v => v.dimension_id === a.dimension_id && v.value === a.value)?.names) || a.value).join(' · ');

  return (
    <div className="item-card">
      <div className="itemhead">
        <img src={mediaUrl(item.variant?.image_path)} alt="" loading="lazy" />
        <span>
          <span className="name">{nm(item.exercise?.names) || item.exercise_id}</span>
          <span className="muted small" style={{ display: 'block' }}>
            {item.variant_locked ? nm(item.variant?.names) : (attrText || t('any_variation'))}
          </span>
        </span>
        <span className="inline">
          <button className="btn mini" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
            {t('variations')} {open ? '▴' : '▾'}
          </button>
          <button className="btn mini danger" type="button"
            onClick={() => confirm(t('confirm_delete')) && deleteRow('program_workout_items', item.id).then(reload)}>×</button>
        </span>
      </div>

      {open && <Variations item={item} dimensions={dimensions} values={values} reload={reload} />}
      <SetsTable item={item} block={block} reload={reload} />
    </div>
  );
}

function SetsTable({ item, block, reload }: { item: EditorItem; block: EditorBlock; reload: () => void }) {
  const { t } = useI18n();
  const num = (v: string) => (v === '' ? null : Number(v));
  const cell = (set: EditorSet, field: keyof EditorSet, width = 64) => (
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
            <td><select value={set.kind} onChange={e => updateSet(set.id, { kind: e.target.value }).then(reload)}>
              {KINDS.map(k => <option key={k} value={k}>{t(`kind_${k}` as 'kind_working')}</option>)}
            </select></td>
            <td>{cell(set, 'reps_min')}</td>
            <td>{cell(set, 'reps_max')}</td>
            <td>{cell(set, 'duration_seconds')}</td>
            <td>{cell(set, 'load_kg')}</td>
            <td>{cell(set, 'rpe', 52)}</td>
            <td>{cell(set, 'rest_seconds')}</td>
            <td><select value={set.side} onChange={e => updateSet(set.id, { side: e.target.value }).then(reload)}>
              {SIDES.map(s => <option key={s} value={s}>{t(`side_${s}` as 'side_both')}</option>)}
            </select></td>
            <td><select value={set.other_side || ''} disabled={set.side === 'both'}
              onChange={e => updateSet(set.id, { other_side: e.target.value || null }).then(reload)}>
              <option value="">—</option>
              <option value="rest">{t('other_rest')}</option>
              <option value="hold">{t('other_hold')}</option>
              <option value="work">{t('other_work')}</option>
            </select></td>
            <td><span className="inline">
              <label className="small muted" title={t('per_side')}>
                <input type="checkbox" checked={set.reps_per_side}
                  onChange={e => updateSet(set.id, { reps_per_side: e.target.checked }).then(reload)} />
              </label>
              {block.mode !== 'rounds' && (
                <button className="btn mini danger" type="button" onClick={() => deleteRow('item_sets', set.id).then(reload)}>×</button>
              )}
            </span></td>
          </tr>
        ))}
      </tbody>
      {block.mode !== 'rounds' && (
        <tfoot><tr><td colSpan={11}>
          <button className="btn mini" type="button"
            onClick={() => addSet(item.id, item.sets.at(-1), item.sets.length + 1).then(reload)}>{t('add_set')}</button>
        </td></tr></tfoot>
      )}
    </table>
  );
}
