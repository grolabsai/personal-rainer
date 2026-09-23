// One line icon per equipment id in the catalog, so a list of kit reads at a glance on a phone.
// Only the inner shapes: the caller supplies the <svg> so it can set size and colour.
// Same 24×24 grid, 1.6 stroke, no fill — a new id falls back to the bodyweight figure.
export const EQUIPMENT_ICONS = {
  bodyweight: '<circle cx="12" cy="5" r="2.4"/><path d="M12 7.5v6m0 0-3 6m3-6 3 6M6.5 10h11"/>',
  // A dumbbell is short and held in one hand; a barbell is long and runs off both sides. They are
  // drawn as different silhouettes, not as the same bar at two widths, because a coach reads the
  // shape and never the pixel count: round bells against square plates, stubby against full width.
  dumbbell: '<circle cx="7" cy="12" r="3.6"/><circle cx="17" cy="12" r="3.6"/><path d="M10.6 12h2.8"/>',
  barbell: '<path d="M2 12h20"/><path d="M5 8.5v7M7.5 7v10M16.5 7v10M19 8.5v7"/>',
  'ez-bar': '<path d="M3 9v6M5.5 8v8M18.5 8v8M21 9v6M5.5 12h3l1.5-2 2 4 2-4 1.5 2h3"/>',
  'trap-bar': '<path d="M3 9v6M21 9v6M6 8h12l-2 4 2 4H6l2-4z"/>',
  'cambered-bar': '<path d="M3 9v6M21 9v6M5.5 11h3v4h7v-4h3"/>',
  kettlebell: '<path d="M9 7a3 3 0 0 1 6 0"/><path d="M8.5 8.5C6.5 10 5.5 12.5 6 15a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3c.5-2.5-.5-5-2.5-6.5z"/>',
  cable: '<path d="M5 3h14M12 3v6a3 3 0 0 1-3 3H7"/><rect x="4" y="12" width="6" height="4" rx="1"/><path d="M12 9v3"/>',
  band: '<path d="M4 12c3-5 13-5 16 0-3 5-13 5-16 0Z"/><path d="M8 12h8"/>',
  machine: '<rect x="3" y="5" width="7" height="14" rx="1"/><path d="M10 9h5a3 3 0 0 1 3 3v5M21 9v8"/>',
  'smith-machine': '<path d="M5 3v18M19 3v18M7 9h10M7 15h10"/>',
  'sled-machine': '<path d="M3 16h12l4-8M5 16l-1 3h14M8 8h7"/>',
  'medicine-ball': '<circle cx="12" cy="12" r="8"/><path d="M4.5 9.5c5 2 10 2 15 0M4.5 14.5c5-2 10-2 15 0"/>',
  'stability-ball': '<circle cx="12" cy="13" r="7"/><path d="M5.5 10c4 2 9 2 13 0"/>',
  bosu: '<path d="M3 17h18M5 17a7 7 0 0 1 14 0"/>',
  roller: '<rect x="4" y="9" width="16" height="7" rx="3.5"/><path d="M9 9v7"/>',
  'ab-wheel': '<circle cx="12" cy="14" r="5"/><path d="M4 14h4M16 14h4"/>',
  rope: '<path d="M6 4c4 3-4 5 0 8s-4 5 0 8M14 4c4 3-4 5 0 8s-4 5 0 8"/>',
  bench: '<path d="M3 10h18M5 10v8M19 10v8M8 10V7h8v3"/>',
  'preacher-bench': '<path d="M4 18h10M5 18v-4l8-5M13 9l6 3"/>',
  'pull-up-bar': '<path d="M4 4h16M8 4v4a4 4 0 0 0 8 0V4"/><path d="M12 12v8"/>',
  'dip-bars': '<path d="M5 6v14M19 6v14M5 8h14"/>',
  box: '<path d="M4 9h16v10H4z"/><path d="M4 9l3-4h10l3 4"/>',
  wall: '<path d="M3 5h18v14H3z"/><path d="M3 12h18M9 5v7M15 12v7"/>',
  towel: '<path d="M6 4h12v12a4 4 0 0 1-4 4H6z"/><path d="M6 8h12"/>',
  'suspension-trainer': '<path d="M12 3v5M9 8h6M9 8l-2 8M15 8l2 8"/>',
  rings: '<circle cx="7" cy="16" r="4"/><circle cx="17" cy="16" r="4"/><path d="M7 12V4M17 12V4"/>',
  landmine: '<path d="M4 18h6M6 18l10-9"/><circle cx="18" cy="8" r="2.5"/>',
  sledgehammer: '<path d="M5 19 16 8"/><path d="m14 4 6 6-3 3-6-6z"/>',
  tire: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4.5M12 15.5V20M4 12h4.5M15.5 12H20"/>',
  'arm-blaster': '<path d="M4 8h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M8 8V5M16 8V5"/>',
  'weight-plate': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
  'cardio-machine': '<path d="M4 18h6l4-12h6"/><circle cx="7" cy="18" r="2.5"/>',
  chair: '<path d="M7 4v9M17 4v9M7 13h10M8 13v7M16 13v7"/>',
};

export const equipmentShapes = id => EQUIPMENT_ICONS[id] || EQUIPMENT_ICONS.bodyweight;

// Ready-made markup, for pages that build HTML strings.
export const equipmentIcon = id =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"` +
  ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${equipmentShapes(id)}</svg>`;
