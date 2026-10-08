// ─────────────────────────────────────────────────────────────
// server/src/controllers/photo.controller.js
//
// Thin HTTP layer for floor photos, same respondError pattern as the
// other controllers.
// ─────────────────────────────────────────────────────────────
import photoService from '../services/photo.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({ success: false, message: status < 500 ? err.message : fallback });
};

// POST /api/photos — { entityType, entityId, dataUrl }
const addPhoto = async (req, res) => {
  try {
    const data = await photoService.addPhoto(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'addPhoto', 'Could not save the photo.');
  }
};

// GET /api/photos?entityType=…&entityIds=1,2,3 — no pictures, just what there is.
const listPhotos = async (req, res) => {
  try {
    const data = await photoService.listPhotos(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listPhotos', 'Could not load the photos.');
  }
};

// GET /api/photos/:id/image — the picture itself.
const getImage = async (req, res) => {
  try {
    const image = await photoService.getImage(req.params.id);
    res.set('Content-Type', image.content_type);
    // A photo never changes once taken. Private: it is behind a sign-in.
    res.set('Cache-Control', 'private, max-age=86400, immutable');
    res.status(200).send(image.data);
  } catch (err) {
    respondError(res, err, 'getImage', 'Could not load the photo.');
  }
};

export default { addPhoto, listPhotos, getImage };
