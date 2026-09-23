// Which colour family each way of varying an exercise belongs to. One definition for both apps;
// the colours themselves live in variation-language.css.
export const FAMILY = {
  equipment: 'equipment',
  bench_angle: 'angle',
  position: 'position',
  grip: 'grip',
  grip_width: 'grip-width',
  laterality: 'sides',
  stance: 'stance',
  style: 'style',
};
export const familyOf = dimensionId => FAMILY[dimensionId] || 'style';

// The order a name reads in, matching the generated names in the catalog.
export const DIMENSION_ORDER = ['bench_angle', 'position', 'grip', 'grip_width', 'laterality', 'stance', 'style'];
export const dimensionRank = id => {
  const i = DIMENSION_ORDER.indexOf(id);
  return i === -1 ? DIMENSION_ORDER.length : i;
};

// What differs across a set of variations: the families whose values are not the same in all of
// them. "These four are the same exercise; only the equipment changes."
export function differingFamilies(variants) {
  const seen = new Map();
  for (const v of variants) {
    for (const a of v.attributes ?? []) {
      const key = `attr:${a.dimension_id}`;
      (seen.get(key) ?? seen.set(key, new Set()).get(key)).add(a.value);
    }
    const kit = (v.equipment ?? []).map(e => e.equipment_id ?? e).sort().join('+');
    (seen.get('equipment') ?? seen.set('equipment', new Set()).get('equipment')).add(kit);
  }
  const differing = new Set();
  for (const [key, values] of seen) {
    // a dimension only some variations state is itself a difference
    const stated = key === 'equipment' ? variants.length : variants.filter(
      v => (v.attributes ?? []).some(a => `attr:${a.dimension_id}` === key)).length;
    if (values.size > 1 || stated !== variants.length) differing.add(key);
  }
  return differing;
}
