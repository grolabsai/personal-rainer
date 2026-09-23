// Line icons for everything the apps name: body regions, exercise types, block purposes, the
// variation dimensions and the sides. Same grid and weight as equipment-icons.js (24×24, 1.6
// stroke, no fill), so a chip can carry either without looking mismatched.
// Keys are the ids used in the database, prefixed by what they belong to.
export const UI_ICONS = {
  // Body regions (muscles where level = 'region') — a torso fragment with the part picked out
  'region:neck': '<path d="M9 4v3a3 3 0 0 0 6 0V4"/><path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>',
  'region:shoulders': '<path d="M12 8a4 4 0 0 1 4 4v2"/><path d="M12 8a4 4 0 0 0-4 4v2"/><circle cx="4.5" cy="12" r="2.5"/><circle cx="19.5" cy="12" r="2.5"/>',
  'region:chest': '<path d="M4 8h16"/><path d="M12 8v10"/><path d="M4 8c0 5 3 8 8 10 5-2 8-5 8-10"/>',
  'region:back': '<path d="M12 4v16"/><path d="M12 6c-3 1-5 3-6 6 1 4 3 6 6 7"/><path d="M12 6c3 1 5 3 6 6-1 4-3 6-6 7"/>',
  'region:arms': '<path d="M7 5v6a5 5 0 0 0 5 5"/><path d="M17 5v6a5 5 0 0 1-5 5"/><path d="M12 16v4"/>',
  'region:abdomen': '<rect x="7" y="4" width="10" height="16" rx="3"/><path d="M7 9h10M7 13h10M12 4v16"/>',
  'region:hips': '<path d="M5 6c1 4 3 6 7 6s6-2 7-6"/><path d="M6 12l-1 8M18 12l1 8"/>',
  'region:legs': '<path d="M8 3v8l-1 10M16 3v8l1 10"/><path d="M8 11h8"/>',
  'region:cardiovascular-system': '<path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9z"/>',
  'region:ankle': '<path d="M10 4v8l-3 4h9"/><path d="M7 16v4h10"/>',
  'region:wrist': '<path d="M7 4v7a5 5 0 0 0 10 0V4"/><path d="M5 13h14"/>',
  'region:hand': '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-5-5v-3a1.5 1.5 0 0 1 3 0"/>',
  'region:foot': '<path d="M6 5c3 0 4 3 4 6l2 5h5a2 2 0 0 1 0 4H8a3 3 0 0 1-3-3V5z"/>',

  // What kind of thing it is
  'type:strength': '<path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10"/>',
  'type:stretch': '<circle cx="12" cy="5" r="2"/><path d="M12 7v6M12 13l-4 6M12 13l4 6M6 9l6 2 6-2"/>',
  'type:mobility': '<path d="M12 4a8 8 0 1 1-8 8"/><path d="M4 8v4h4"/><circle cx="12" cy="12" r="2"/>',
  'type:cardio': '<path d="M3 13h4l2-5 3 10 2-6 2 3h5"/>',

  // What a block is for
  'purpose:warmup': '<path d="M12 3c2 3 .5 4.5 0 6-2-1-3 1-3 3a4 4 0 0 0 8 0c0-3-2-6-5-9z"/><path d="M6 20h12"/>',
  'purpose:main': '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
  'purpose:accessory': '<circle cx="12" cy="12" r="3"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2"/>',
  'purpose:finisher': '<path d="M5 20V4l7 3 7-3v10l-7 3-7-3"/>',
  'purpose:cooldown': '<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/><path d="M12 7l-2.5-2M12 7l2.5-2M12 17l-2.5 2M12 17l2.5 2"/>',

  // The variation dimensions
  'dim:equipment': '<path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10"/>',
  'dim:bench_angle': '<path d="M3 19h18"/><path d="M4 17l12-8"/><path d="M16 9v8"/><path d="M4 14v3"/>',
  'dim:position': '<circle cx="8" cy="6" r="2"/><path d="M8 8v5l-3 6M8 13l4 2 6-2M18 11v10"/>',
  'dim:grip': '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10.5V5a1.5 1.5 0 0 1 3 0v5.5M13 11V7a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6 6 6 0 0 1-6-6v-2a1.5 1.5 0 0 1 3 0"/>',
  'dim:grip_width': '<path d="M3 12h18"/><path d="M6 8v8M18 8v8"/><path d="M9 10v4M15 10v4"/>',
  'dim:laterality': '<path d="M12 3v18"/><path d="M8 8a4 4 0 0 0-4 4 4 4 0 0 0 4 4"/><path d="M16 8a4 4 0 0 1 4 4 4 4 0 0 1-4 4"/>',
  'dim:stance': '<path d="M12 4v6"/><path d="M12 10l-5 10M12 10l5 10"/><path d="M5 20h5M14 20h5"/>',
  'dim:style': '<path d="M12 3l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1.5z"/>',

  // Which side does the work
  'side:both': '<circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/>',
  'side:each': '<circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3" stroke-dasharray="3 3"/>',
  'side:alternating': '<path d="M4 9h12l-3-3M20 15H8l3 3"/>',
  'side:left': '<circle cx="7" cy="12" r="3"/><path d="M14 12h6" stroke-dasharray="3 3"/>',
  'side:right': '<circle cx="17" cy="12" r="3"/><path d="M4 12h6" stroke-dasharray="3 3"/>',

  // Small things the screens need
  'ui:search': '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  'ui:drag': '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  'ui:lock': '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  'ui:place': '<path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  'ui:athlete': '<circle cx="12" cy="7" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  'ui:calendar': '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  'ui:library': '<path d="M5 4h5v16H5zM12 4h3v16h-3zM17 6l3 14"/>',
  'ui:workout': '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 7v10M16 7v10"/>',
  'ui:sparkle': '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/>',
  'ui:sets': '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="7" cy="7" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="17" cy="17" r="1.3"/>',
  'ui:rest': '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
};

export const uiShapes = key => UI_ICONS[key] || '';

export const uiIcon = key =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"` +
  ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiShapes(key)}</svg>`;
