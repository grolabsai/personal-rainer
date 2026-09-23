import { dimensionRank, familyOf } from '../shared/variation-language.js';
import { useI18n, type Names } from '../lib/i18n';
import { Icon } from './Icon';

export type NameParts = {
  exercise: Names;
  attributes?: { dimension_id: string; value: string }[];
  equipment?: { equipment_id: string }[];
};

// An exercise's name, shown as what it is made of rather than as one string: the movement, then
// each way it has been narrowed, then the kit. Colours come from variation-language.css, so the
// same fact is the same colour everywhere. `same` dims the parts a set of variations share, which
// is how a grid says "these four are the same exercise; only the equipment changes".
export function VariantName({ parts, values, equipment, same, small }: {
  parts: NameParts;
  values: { dimension_id: string; value: string; names: Names }[];
  equipment: { id: string; names: Names }[];
  same?: Set<string>;
  small?: boolean;
}) {
  const { nm } = useI18n();
  const attrs = [...(parts.attributes ?? [])].sort((a, b) => dimensionRank(a.dimension_id) - dimensionRank(b.dimension_id));
  const kit = parts.equipment ?? [];
  const dim = (key: string) => (same?.has(key) ? ' same' : '');

  return (
    <span className={`vname${small ? ' small' : ''}`}>
      <span className="vex">{nm(parts.exercise)}</span>
      {attrs.map(a => (
        <span key={`${a.dimension_id}:${a.value}`} className={`vpart f-${familyOf(a.dimension_id)}${dim(`attr:${a.dimension_id}`)}`}>
          <Icon name={`dim:${a.dimension_id}`} size={13} />
          {nm(values.find(v => v.dimension_id === a.dimension_id && v.value === a.value)?.names) || a.value}
        </span>
      ))}
      {kit.map(e => (
        <span key={e.equipment_id} className={`vpart f-equipment${dim('equipment')}`}>
          <Icon name={e.equipment_id} size={13} />
          {nm(equipment.find(x => x.id === e.equipment_id)?.names) || e.equipment_id}
        </span>
      ))}
    </span>
  );
}
