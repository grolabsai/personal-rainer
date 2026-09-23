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
import { loadEquipment } from '../src/lib/catalog';
import { useLoad } from '../src/lib/useLoad';
import '../src/styles.css';

const fakeItem = (exercise_id: string): EditorItem => ({
  id: 'preview', position: 1, exercise_id, variant_id: null, variant_locked: false,
  substitution_level: null, substitution_note: {}, notes: {},
  exercise: null, variant: null, attributes: [], equipment: [], sets: [],
});

function Harness() {
  const { t } = useI18n();
  const [ex, setEx] = useState(new URLSearchParams(location.search).get('ex') || 'lateral-raise');
  const vocab = useLoad(async () => ({ ...(await loadDimensions()), equipment: await loadEquipment() }), []);
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
                <Variations item={fakeItem(ex)} exercise={{ en: ex.replace(/^x-/, '').replace(/-/g, ' ') }} dimensions={vocab.data?.dimensions || []}
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
