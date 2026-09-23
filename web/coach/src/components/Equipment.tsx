import { equipmentShapes } from '../shared/equipment-icons.js';

export function EquipmentIcon({ id }: { id: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: equipmentShapes(id) }} />
  );
}
