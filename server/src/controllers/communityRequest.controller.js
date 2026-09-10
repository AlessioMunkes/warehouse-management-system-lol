// ─────────────────────────────────────────────────────────────
// server/src/controllers/communityRequest.controller.js
//
// Thin HTTP layer for the ADM-5.0 / BR-28 community request log. All
// validation and orchestration lives in communityRequest.service.js —
// controllers here only pull data off the request, call the service,
// and shape the response. Errors go to next(err) for the central
// handler in server/index.js, same convention as the love-activism,
// picking and donation controllers.
// ─────────────────────────────────────────────────────────────
import communityRequestService from '../services/communityRequest.service.js';

// ── GET /api/community-requests ──────────────────────────────
const listRequests = async (req, res, next) => {
  try {
    const result = await communityRequestService.listRequests(req.query);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/community-requests/:id ──────────────────────────
const getRequest = async (req, res, next) => {
  try {
    const result = await communityRequestService.getRequest(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/community-requests ─────────────────────────────
const createRequest = async (req, res, next) => {
  try {
    const result = await communityRequestService.createRequest(req.body, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/community-requests/:id/claim ──────────────────
// The acting user takes ownership — no body needed.
const claimRequest = async (req, res, next) => {
  try {
    const result = await communityRequestService.claim(req.params.id, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/community-requests/:id/resolve ────────────────
// Body: { outcome, outcomeNote }.
const resolveRequest = async (req, res, next) => {
  try {
    const result = await communityRequestService.resolve(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export default {
  listRequests,
  getRequest,
  createRequest,
  claimRequest,
  resolveRequest,
};
