// ─────────────────────────────────────────────────────────────
// client/src/services/photoAPI.js
//
// Photos a worker takes on the floor: of an item they flagged, or of a
// delivery as it arrived.
//
// SHRUNK ON THE PHONE FIRST. A phone camera's picture is 3 to 8 MB. It
// is drawn down to at most 1280 pixels on its long side and saved as a
// JPEG, which is about 150 KB: enough to see a torn bag or a short
// crate, small enough to send on one bar of signal and to keep in the
// database. The server refuses anything over 400 KB.
//
// With no signal the photo is kept on the phone and sent later, like
// the rest of the floor's work (offlinePost.js).
// ─────────────────────────────────────────────────────────────
import { apiGet, API_BASE } from './api';
import { postOrQueue } from './offlinePost';

const MAX_SIDE = 1280;
// Tried in turn until the picture is under the limit.
const QUALITIES = [0.72, 0.55, 0.4];
const MAX_DATA_URL_CHARS = Math.floor(390 * 1024 * (4 / 3));

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not-a-photo')); };
  img.src = url;
});

/** A camera file as a small JPEG data URL. Rejects with 'not-a-photo' for anything else. */
export const shrinkPhoto = async (file) => {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('not-a-photo');
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

  let dataUrl = '';
  for (const quality of QUALITIES) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_CHARS) break;
  }
  return dataUrl;
};

// POST /api/photos. Returns the saved photo, or { queued: true } when it
// is waiting on the phone.
export const uploadPhoto = async ({ entityType, entityId, dataUrl }) => {
  const res = await postOrQueue('/api/photos', { entityType, entityId, dataUrl }, { kind: 'photo', label: 'A photo' });
  return res.queued ? res : res.data;
};

// GET /api/photos — what photos these records have. No pictures in the
// answer; each has a `url` to show.
export const listPhotos = async (entityType, entityIds) => {
  const ids = [].concat(entityIds ?? []).filter(Boolean);
  if (ids.length === 0) return [];
  const res = await apiGet(`/api/photos?entityType=${encodeURIComponent(entityType)}&entityIds=${ids.join(',')}`);
  return (res.data ?? []).map((p) => ({ ...p, url: `${API_BASE}${p.url}` }));
};

export default { shrinkPhoto, uploadPhoto, listPhotos };
