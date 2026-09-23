import { useEffect, useState } from 'react';
import { mediaUrl } from '../lib/media';

export type Preview = { name: string; gif: string; sub?: string; top: number } | null;

// Browsing a list of thumbnails the size of a postage stamp tells you very little. Resting on one
// shows the animation as large as the window allows, beside the list, so a coach can tell a
// Bulgarian split squat from a lunge before adding it.
export function HoverPreview({ preview, left = 360 }: { preview: Preview; left?: number }) {
  const [shown, setShown] = useState<Preview>(null);
  // A short delay keeps the card from flickering while the pointer crosses the list.
  useEffect(() => {
    if (!preview) { setShown(null); return; }
    const id = setTimeout(() => setShown(preview), 120);
    return () => clearTimeout(id);
  }, [preview]);
  if (!shown) return null;

  const size = Math.min(420, Math.max(260, window.innerHeight - 220));
  const top = Math.min(Math.max(shown.top - 60, 12), Math.max(12, window.innerHeight - size - 90));
  return (
    <figure className="hoverpreview" style={{ left, top, width: size }}>
      <img src={mediaUrl(shown.gif)} alt="" style={{ width: size - 24, height: size - 24 }} />
      <figcaption>
        <strong>{shown.name}</strong>
        {shown.sub && <span className="muted small" style={{ display: 'block' }}>{shown.sub}</span>}
      </figcaption>
    </figure>
  );
}
