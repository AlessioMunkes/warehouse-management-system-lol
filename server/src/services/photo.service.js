// ─────────────────────────────────────────────────────────────
// server/src/services/photo.service.js
//
// What may be saved as a floor photo, and the shape a screen reads.
//
// The phone sends the picture as a data URL, already shrunk and
// compressed (client/src/services/photoAPI.js). The size is checked
// again here: the picture goes in a database row, and one full-size
// camera image would be thirty of these.
// ─────────────────────────────────────────────────────────────
import photoRepo from '../repositories/photo.repository.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

export const ENTITY_TYPES = ['picking_slip_item', 'purchase_order'];
export const MAX_BYTES = 400 * 1024;
const DATA_URL = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/]+=*)$/;

// No real photo is smaller than this; a few bytes that merely start
// like one are not a picture anyone can look at.
export const MIN_BYTES = 1024;

// How each kind of picture starts and ends, so a file that only claims
// to be an image, or one cut off part-way, is refused. It is not a full
// decode: it keeps out what is plainly not a photo.
const looksLike = (contentType, bytes) => {
  if (bytes.length < MIN_BYTES) return false;
  if (contentType === 'image/jpeg') {
    const end = bytes.subarray(bytes.length - 2);
    return bytes[0] === 0xff && bytes[1] === 0xd8 && end[0] === 0xff && end[1] === 0xd9;
  }
  if (contentType === 'image/png') {
    return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      && bytes.subarray(bytes.length - 12).includes('IEND', 0, 'latin1');
  }
  return bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP';
};

const positiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toPhoto = (row) => ({
  id: Number(row.id),
  entityType: row.entity_type,
  entityId: row.entity_id,
  byteSize: row.byte_size,
  takenAt: row.created_at,
  takenBy: row.created_by_name ?? null,
  url: `/api/photos/${row.id}/image`,
});

const addPhoto = async (body, userId) => {
  if (!ENTITY_TYPES.includes(body?.entityType)) throw fail(400, 'Say what the photo is of.');
  const entityId = positiveInt(body?.entityId);
  if (!entityId) throw fail(400, 'Say which record the photo is of.');

  const match = DATA_URL.exec(String(body?.dataUrl ?? ''));
  if (!match) throw fail(400, 'That is not a photo this can keep. Take it again.');
  const data = Buffer.from(match[2], 'base64');
  if (data.length === 0 || !looksLike(match[1], data)) throw fail(400, 'That is not a photo this can keep. Take it again.');
  if (data.length > MAX_BYTES) throw fail(413, 'The photo is too large. Take it again.');

  if (!(await photoRepo.entityExists(body.entityType, entityId))) {
    throw fail(404, 'What this photo is of no longer exists.');
  }
  const row = await photoRepo.insert({ entityType: body.entityType, entityId, contentType: match[1], data, userId });
  return toPhoto(row);
};

const listPhotos = async (query) => {
  if (!ENTITY_TYPES.includes(query?.entityType)) throw fail(400, 'Say what the photos are of.');
  const ids = [...new Set(String(query?.entityIds ?? query?.entityId ?? '').split(',').map(positiveInt).filter(Boolean))];
  if (ids.length === 0) return [];
  if (ids.length > 500) throw fail(400, 'Ask for fewer records at a time.');
  return (await photoRepo.listFor(query.entityType, ids)).map(toPhoto);
};

const getImage = async (rawId) => {
  const id = positiveInt(rawId);
  if (!id) throw fail(400, 'A valid photo ID is required.');
  const image = await photoRepo.getImage(id);
  if (!image) throw fail(404, 'Photo not found.');
  return image;
};

export default { addPhoto, listPhotos, getImage };
