// Development harness: renders the real exercise-detail screen against the live catalog without a
// sign-in, so the substitutes and the body map can be reviewed on their own. Vite serves it at
// /mock/detail-live.html?v=0025 in dev only — index.html is the app's single build entry.
// Swapping needs a session, so no swap buttons appear here.
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../src/lib/i18n';
import { ExerciseDetail } from '../src/screens/ExerciseDetail';
import '../src/styles.css';

const id = new URLSearchParams(location.search).get('v') || '0025';
if (window.matchMedia('(prefers-color-scheme: light)').matches) document.documentElement.classList.add('gl-light');

createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <div className="shell"><main className="content">
      <ExerciseDetail id={id} itemId={null} onSwap={null} swapped={null} />
    </main></div>
  </I18nProvider>,
);
