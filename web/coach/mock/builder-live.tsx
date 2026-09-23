// Development harness: the two parts of the builder that read only the public catalog — the
// exercise navigator and the variations panel — rendered without a sign-in, so their look and their
// defaults can be checked on their own. Writing needs a coach session, so the selects are inert here.
// Vite serves it at /mock/builder-live.html?ex=lateral-raise in dev only.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, useI18n } from '../src/lib/i18n';
import { ExerciseNav } from '../src/components/ExerciseNav';
import { Variations } from '../src/components/Variations';
import { loadDimensions, type EditorItem } from '../src/lib/data';
import { loadEquipment, loadExerciseCards } from '../src/lib/catalog';
import { HoverPreview, previewAt, type Preview } from '../src/components/HoverPreview';
import { Icon } from '../src/components/Icon';
import { mediaUrl } from '../src/lib/media';
import { useLoad } from '../src/lib/useLoad';
import '../src/styles.css';

const fakeItem = (exercise_id: string): EditorItem => ({
  id: 'preview', position: 1, exercise_id, variant_id: null, variant_locked: false,
  substitution_level: null, substitution_note: {}, notes: {},
  exercise: null, variant: null, attributes: [], equipment: [], sets: [],
});

// The panel's writes, kept in memory, so the pills can actually be pressed here: the rows narrow
// each other, and that is the behaviour worth checking without a coach session.
function useFakeItem(exercise_id: string) {
  const [item, setItem] = useState(() => fakeItem(exercise_id));
  if (item.exercise_id !== exercise_id) setItem(fakeItem(exercise_id));
  const store = {
    setEquipment: async (_id: string, equipment_id: string | null) =>
      setItem(i => ({ ...i, equipment: equipment_id ? [{ equipment_id }] : [] })),
    setAttribute: async (_id: string, dimension_id: string, value: string | null) =>
      setItem(i => ({ ...i, attributes: value
        ? [...i.attributes.filter(a => a.dimension_id !== dimension_id), { dimension_id, value }]
        : i.attributes.filter(a => a.dimension_id !== dimension_id) })),
    update: async (_id: string, patch: Record<string, unknown>) => setItem(i => ({ ...i, ...patch })),
  };
  return { item, store };
}

// The head of an item as the editor draws it: movers, the picture of what it currently is, and the
// name in parts. Static here — it exists so the layout can be checked without a coach session.
function ItemHead({ ex }: { ex: string }) {
  const { t } = useI18n();
  const card = useLoad(async () => (await loadExerciseCards()).find(c => c.exercise_id === ex), [ex]);
  const [preview, setPreview] = useState<Preview>(null);
  return (
    <div className="itemhead" onMouseLeave={() => setPreview(null)}>
      <span className="movers">
        <button className="movebtn" type="button" aria-label={t('up')}><Icon name="ui:up" size={13} /></button>
        <button className="movebtn" type="button" aria-label={t('down')}><Icon name="ui:down" size={13} /></button>
      </span>
      <img src={mediaUrl(card.data?.image_path)} alt=""
        onMouseEnter={e => setPreview(previewAt(e.currentTarget,
          { name: card.data?.names?.en || ex, gif: card.data?.gif_path || '' }))} />
      <span>
        <span className="vname"><span className="vex">{card.data?.names?.en || ex}</span></span>
        <span className="muted small itemsub">{t('adapts')}</span>
      </span>
      <span className="inline"><button className="btn mini" type="button">{t('variations')} ▴</button></span>
      <HoverPreview preview={preview} />
    </div>
  );
}

function Harness() {
  const { t } = useI18n();
  const [ex, setEx] = useState(new URLSearchParams(location.search).get('ex') || 'lateral-raise');
  const vocab = useLoad(async () => ({ ...(await loadDimensions()), equipment: await loadEquipment() }), []);
  const live = useFakeItem(ex);
  return (
    <div className="shell">
      <div className="topbar"><span className="title">Builder preview — {ex}</span></div>
      <main className="content">
        <div className="builder">
          <ExerciseNav onPick={c => setEx(c.exercise_id)} />
          <div>
            <div className="block-card target">
              <div className="block-head"><span className="badge l1">{t('drop_here')}</span></div>
              <div className="item-card">
                <ItemHead ex={ex} />
                <Variations item={live.item} store={live.store} exercise={{ en: ex.replace(/^x-/, '').replace(/-/g, ' ') }}
                  dimensions={vocab.data?.dimensions || []}
                  values={vocab.data?.values || []} equipment={vocab.data?.equipment || []} reload={() => {}} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

if (window.matchMedia('(prefers-color-scheme: light)').matches) document.documentElement.classList.add('gl-light');
createRoot(document.getElementById('root')!).render(<I18nProvider><Harness /></I18nProvider>);
