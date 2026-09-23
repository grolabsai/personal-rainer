import { useEffect, useState } from 'react';
import { mediaUrl } from '../lib/media';

export type Preview = { name: string; gif: string; sub?: string; top: number; left: number } | null;

const size = () => Math.min(420, Math.max(260, window.innerHeight - 220));

// Where the card goes: beside the thing being hovered, on whichever side has room, and never off
// the top or bottom of the window. Every thumbnail in the tool uses this, so resting on a picture
// always means the same thing.
export function previewAt(el: Element, p: { name: string; gif: string; sub?: string }): Preview {
  const r = el.getBoundingClientRect();
  const s = size();
  const left = r.right + 16 + s <= window.innerWidth ? r.right + 16 : Math.max(12, r.left - s - 16);
  const top = Math.min(Math.max(r.top - 40, 12), Math.max(12, window.innerHeight - s - 90));
  return { ...p, left, top };
}

// Browsing a list of thumbnails the size of a postage stamp tells you very little. Resting on one
// shows the animation as large as the window allows, so a coach can tell a Bulgarian split squat
// from a lunge before adding it.
export function HoverPreview({ preview }: { preview: Preview }) {
  const [shown, setShown] = useState<Preview>(null);
  // A short delay keeps the card from flickering while the pointer crosses the list.
  useEffect(() => {
    if (!preview) { setShown(null); return; }
    const id = setTimeout(() => setShown(preview), 120);
    return () => clearTimeout(id);
  }, [preview]);
  if (!shown) return null;

  const s = size();
  return (
    <figure className="hoverpreview" style={{ left: shown.left, top: shown.top, width: s }}>
      <img src={mediaUrl(shown.gif)} alt="" style={{ width: s - 24, height: s - 24 }} />
      <figcaption>
        <strong>{shown.name}</strong>
        {shown.sub && <span className="muted small" style={{ display: 'block' }}>{shown.sub}</span>}
      </figcaption>
    </figure>
  );
}
