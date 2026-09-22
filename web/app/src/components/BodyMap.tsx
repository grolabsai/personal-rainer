import { useMemo } from 'react';
import { BODY_MAP_CSS, bodyMap, viewsFor, type BodyView, type MuscleState } from '../shared/body-map.js';

// The same body map the mock pages use: one vector shape per muscle, coloured by state.
// It builds SVG as a string, so the CSS travels with it and is injected once.
let injected = false;
function injectCss() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = BODY_MAP_CSS;
  document.head.append(style);
}

export type States = Record<string, MuscleState>;

export function BodyMap({ states, width = 132, views, labels = true, title = '' }: {
  states: States; width?: number; views?: BodyView[]; labels?: boolean; title?: string;
}) {
  injectCss();
  const html = useMemo(
    () => bodyMap({ states, width, views: views ?? viewsFor(states), labels, title }),
    [states, width, views, labels, title],
  );
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// Which views two sets of muscles need between them, so a comparison shows the same figures.
export const viewsForBoth = (a: States, b: States): BodyView[] => viewsFor({ ...a, ...b });
