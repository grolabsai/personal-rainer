import { equipmentShapes } from '../shared/equipment-icons.js';
import type { Names } from '../lib/i18n';
import { useI18n } from '../lib/i18n';

export function EquipmentIcon({ id }: { id: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: equipmentShapes(id) }} />
  );
}

// have === false marks kit the athlete has not got, so a row says why it is out of reach.
export function EquipmentPills({ ids, names, have }: {
  ids: string[]; names: Record<string, Names>; have?: Set<string> | null;
}) {
  const { nm } = useI18n();
  return (
    <>
      {ids.map(id => {
        const missing = have ? !have.has(id) : false;
        return (
          <span key={id} className={`pill ${missing ? 'missing' : 'eq'}`}>
            <EquipmentIcon id={id} />{nm(names[id]) || id}
          </span>
        );
      })}
    </>
  );
}
