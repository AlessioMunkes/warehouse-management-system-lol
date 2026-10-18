// ─────────────────────────────────────────────────────────────
// client/src/components/ui/photo-strip.jsx
//
// The photos the floor took of a record, as small pictures that open
// full size. For the office: a flagged item on a picking slip, a
// delivery on its purchase order.
//
// Give it `photos` when the caller already has them (one request for a
// whole slip), or `entityType` + `entityId` to fetch its own.
//
// Renders nothing when there are none, and nothing when they cannot be
// loaded: a missing photo is not worth an error on a screen that is
// about something else.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { listPhotos } from '@/services/photoAPI';

const takenWords = (photo) => {
  const when = new Date(photo.takenAt).toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return photo.takenBy ? `Photo taken by ${photo.takenBy}, ${when}` : `Photo taken ${when}`;
};

export default function PhotoStrip({ photos: given, entityType, entityId, label }) {
  const [fetched, setFetched] = useState([]);

  useEffect(() => {
    if (given || !entityType || !entityId) return undefined;
    let cancelled = false;
    listPhotos(entityType, [entityId])
      .then((rows) => { if (!cancelled) setFetched(rows); })
      .catch(() => { if (!cancelled) setFetched([]); });
    return () => { cancelled = true; };
  }, [given, entityType, entityId]);

  const photos = given ?? fetched;
  if (!photos || photos.length === 0) return null;

  return (
    <div>
      {label ? <p className="mb-1.5 text-sm font-medium">{label}</p> : null}
      <ul className="flex flex-wrap gap-2">
        {photos.map((photo) => (
          <li key={photo.id}>
            <a href={photo.url} target="_blank" rel="noreferrer" title={takenWords(photo)}>
              {/* White behind it, so a photo with a clear edge reads the
                  same in the dark theme. */}
              <img
                src={photo.url} alt={takenWords(photo)} loading="lazy"
                className="size-16 rounded-md border border-line bg-white object-cover"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
