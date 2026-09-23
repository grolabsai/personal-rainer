// Body map: front and back figures with one vector shape per muscle, coloured by state.
// The shapes come from web/shared/body-paths.js (MIT, see that file's header).
//
// One component, many uses: pass a map of muscle id -> state and style the states in CSS
// (.is-primary, .is-secondary, .is-stabiliser today; add / removed / sore / weak later without
// touching this file).
import { PATHS, VIEWBOX } from './body-paths.js';

// Our muscle ids (from the `muscles` table) -> the drawing's part names.
const TO_PART = {
  pectorals: 'chest', 'pectoralis-major': 'chest', 'pectoralis-minor': 'chest', 'serratus-anterior': 'chest',
  'pectoralis-major-clavicular': 'chest-upper', 'upper-chest': 'chest-upper',
  'pectoralis-major-sternal': 'chest-lower', 'lower-chest': 'chest-lower',
  deltoids: 'deltoids', 'anterior-deltoid': 'deltoids', 'lateral-deltoid': 'deltoids',
  'posterior-deltoid': 'deltoids', 'rotator-cuff': 'deltoids', shoulders: 'deltoids',
  'biceps-brachii': 'biceps', brachialis: 'biceps', 'upper-arm-front': 'biceps',
  'triceps-brachii': 'triceps', 'triceps-long-head': 'triceps', 'triceps-lateral-head': 'triceps',
  'triceps-medial-head': 'triceps', 'upper-arm-back': 'triceps',
  forearm: 'forearm', 'forearm-flexors': 'forearm', 'forearm-extensors': 'forearm', brachioradialis: 'forearm',
  abdominals: 'abs', 'rectus-abdominis': 'abs', 'transversus-abdominis': 'abs', abdomen: 'abs',
  'rectus-abdominis-upper': 'abs-upper', 'upper-abs': 'abs-upper',
  'rectus-abdominis-middle': 'abs-middle', 'mid-abs': 'abs-middle',
  'rectus-abdominis-lower': 'abs-lower', 'lower-abs': 'abs-lower',
  obliques: 'obliques', 'external-oblique': 'obliques', 'internal-oblique': 'obliques',
  trapezius: 'trapezius', 'trapezius-upper': 'trapezius', 'trapezius-middle': 'trapezius', 'trapezius-lower': 'trapezius',
  'latissimus-dorsi': 'upper-back', rhomboids: 'upper-back', 'teres-major': 'upper-back', back: 'upper-back',
  'erector-spinae': 'lower-back',
  glutes: 'gluteal', 'gluteus-maximus': 'gluteal', 'gluteus-medius': 'gluteal', 'gluteus-minimus': 'gluteal', hips: 'gluteal',
  hamstrings: 'hamstring', 'biceps-femoris': 'hamstring', semitendinosus: 'hamstring', semimembranosus: 'hamstring',
  quadriceps: 'quadriceps', 'rectus-femoris': 'quadriceps', 'vastus-lateralis': 'quadriceps',
  'vastus-medialis': 'quadriceps', 'vastus-intermedius': 'quadriceps',
  adductors: 'adductors', 'adductor-magnus': 'adductors', 'adductor-longus': 'adductors',
  'adductor-brevis': 'adductors', gracilis: 'adductors',
  calves: 'calves', gastrocnemius: 'calves', soleus: 'calves',
  'lower-leg-front': 'tibialis', 'tibialis-anterior': 'tibialis', peroneals: 'tibialis',
  'neck-muscles': 'neck', sternocleidomastoid: 'neck', 'levator-scapulae': 'neck', neck: 'neck',
  ankle: 'ankles', hand: 'hands', foot: 'feet',
};
export const partFor = id => TO_PART[id] || id;

// Which views a set of muscles appears in, so a small map can show only what is relevant.
export function viewsFor(states = {}) {
  const parts = Object.entries(states).filter(([, s]) => s).map(([id]) => partFor(id).replace(/-(upper|middle|lower)$/, ''));
  const inView = v => parts.some(p => PATHS[v] && p in PATHS[v]);
  const views = ['front', 'back'].filter(inView);
  return views.length ? views : ['front', 'back'];
}

// Parts that are body, not muscle: always drawn plain so the figure reads as a person.
const BODY_PARTS = new Set(['head', 'hair', 'hands', 'feet', 'knees', 'ankles']);

// Some muscles are trained in parts, so they can be highlighted in parts.
// abs: the source draws each segment separately, grouped here by row (indices measured once, source is pinned).
// chest: one shape per side, split by height with a clip band in the drawing's coordinates.
const SUBDIVIDED = {
  abs: { groups: { upper: [2, 4], middle: [0, 1, 5, 6], lower: [3, 7] } },
  chest: { clip: { upper: [300, 374], lower: [374, 445] } },
};
export const SUB_PARTS = { chest: ['upper', 'lower'], abs: ['upper', 'middle', 'lower'] };
let clipSeq = 0;

/**
 * states: { [muscleId]: 'primary' | 'secondary' | any class suffix }
 * views: ['front', 'back'] · width in css px · labels: show FRONT / BACK captions
 */
export function bodyMap({ states = {}, width = 120, views = ['front', 'back'], labels = true, title = '' } = {}) {
  const byPart = {};
  for (const [id, state] of Object.entries(states)) {
    const part = partFor(id);
    if (state) byPart[part] = state;          // last one wins; primary is passed after secondary
  }
  const cls = (part, state) => BODY_PARTS.has(part) ? 'body' : `muscle${state ? ` is-${state}` : ''}`;
  const view = name => {
    const parts = PATHS[name] || {};
    const shapes = Object.entries(parts).map(([part, ds]) => {
      const whole = byPart[part];
      const sub = SUBDIVIDED[part];
      const subState = s => byPart[`${part}-${s}`];
      const anySub = sub && (SUB_PARTS[part] || []).some(subState);
      if (!anySub) return ds.map(d => `<path class="${cls(part, whole)}" data-part="${part}" d="${d}"/>`).join('');

      if (sub.groups) {   // each shape belongs to one sub-region
        const groupOf = i => Object.keys(sub.groups).find(g => sub.groups[g].includes(i));
        return ds.map((d, i) => {
          const g = groupOf(i);
          return `<path class="${cls(part, subState(g) || whole)}" data-part="${g ? `${part}-${g}` : part}" d="${d}"/>`;
        }).join('');
      }
      // clip: draw the whole shape, then paint the highlighted bands over it
      const base = ds.map(d => `<path class="${cls(part, whole)}" data-part="${part}" d="${d}"/>`).join('');
      const bands = Object.entries(sub.clip).filter(([s]) => subState(s)).map(([s, [y0, y1]]) => {
        const id = `clip${++clipSeq}`;
        return `<clipPath id="${id}"><rect x="0" y="${y0}" width="1448" height="${y1 - y0}"/></clipPath>` +
          `<g clip-path="url(#${id})">${ds.map(d => `<path class="${cls(part, subState(s))}" data-part="${part}-${s}" d="${d}"/>`).join('')}</g>`;
      }).join('');
      return base + bands;
    }).join('');
    const marked = Object.entries(byPart).filter(([, s]) => s).map(([p, s]) => `${p}: ${s}`).join(', ');
    return `<figure class="bodyfig" style="width:${width}px">
        <svg viewBox="${VIEWBOX[name]}" role="img" aria-label="${title || 'Muscles worked'}, ${name} view. ${marked || 'none highlighted'}">${shapes}</svg>
        ${labels ? `<figcaption>${name}</figcaption>` : ''}
      </figure>`;
  };
  return `<div class="bodymap">${views.map(view).join('')}</div>`;
}

// Default look. Colours come from the page's GroLabs tokens; states are classes, so a page can add more.
export const BODY_MAP_CSS = `
.bodymap{display:flex;gap:10px;justify-content:center}
.bodyfig{margin:0;text-align:center}
.bodyfig svg{width:100%;height:auto;display:block}
.bodyfig figcaption{font-family:var(--gl-font-mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--gl-text-tertiary);margin-top:4px}
.bodyfig svg path{vector-effect:non-scaling-stroke;stroke-width:.9;stroke-linejoin:round}
.bodyfig .body{fill:var(--gl-panel);stroke:var(--gl-border-strong)}
.bodyfig .muscle{fill:var(--gl-surface-hover);stroke:var(--gl-border-strong)}
.bodyfig .muscle.is-primary{fill:var(--gl-probe-homepage);stroke:var(--gl-probe-homepage);stroke-width:1.2}
.bodyfig .muscle.is-secondary{fill:color-mix(in srgb,var(--gl-probe-site-wide) 50%,transparent);stroke:var(--gl-probe-site-wide)}
.bodyfig .muscle.is-stabiliser{fill:color-mix(in srgb,var(--gl-probe-pdp) 22%,transparent);stroke:var(--gl-probe-pdp);stroke-dasharray:4 3}
.bodyfig .muscle.is-added{fill:color-mix(in srgb,var(--gl-success) 55%,transparent);stroke:var(--gl-success)}
.bodyfig .muscle.is-dropped{fill:none;stroke:var(--gl-danger);stroke-dasharray:6 4}
`;
