import { equipmentShapes } from '../shared/equipment-icons.js';
import { uiShapes } from '../shared/ui-icons.js';

// One component for every icon in the tool. `name` is the id it belongs to, prefixed by its family:
// region:chest, type:strength, purpose:warmup, dim:grip, side:each, ui:search — or an equipment id.
export function Icon({ name, size = 16, title }: { name: string; size?: number; title?: string }) {
  const shapes = name.includes(':') ? uiShapes(name) : equipmentShapes(name);
  if (!shapes) return null;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + shapes }} />
  );
}
