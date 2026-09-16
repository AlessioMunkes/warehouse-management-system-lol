// ─────────────────────────────────────────────────────────────
// server/src/controllers/slipAccess.controller.js
//
// Thin, like every other controller here: read the request, call the
// service, shape the response. No business logic, no SQL.
//
// The one thing this layer does own is the guest session cookie on
// claim, because minting a token is a transport concern — the service
// returns the volunteer, this decides what the browser is handed.
// ─────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import slipAccessService from '../services/slipAccess.service.js';
import { AUTH_COOKIE, authCookieOptions, sessionMaxAge } from '../config/cookie.js';

// Matches the gate sign-in in volunteer.routes.js. A volunteer's day is
// longer than a staff shift's 8 hours and they cannot reset a password
// if it lapses mid-pallet.
const SESSION_HOURS = 12;

// Errors carry .status from the service. Anything without one is a bug
// or a dead database, and gets a generic 500 — never a raw message,
// which on this surface would be shown to a stranger.
const handle = (res, error, logLabel, fallback) => {
  if (error.status) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.ambiguous ? { ambiguous: true } : {}),
    });
  }
  console.error(logLabel, error.message);
  return res.status(500).json({ success: false, message: fallback });
};

const getPreviewByToken = async (req, res) => {
  try {
    const data = await slipAccessService.getPreviewByToken(req.params.token);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handle(res, error, '[slip:preview]', 'Could not load that pallet.');
  }
};

const getPreviewByShortCode = async (req, res) => {
  try {
    const data = await slipAccessService.getPreviewByShortCode(req.params.code);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handle(res, error, '[slip:code]', 'Could not load that pallet.');
  }
};

const claim = async (req, res) => {
  try {
    // req.guest is set by optionalGuest when the caller already has a
    // valid guest session — bind to that volunteer instead of creating
    // a second row for someone already in the building.
    const { volunteer, slip } = await slipAccessService.claim({
      token: req.params.token ?? req.body?.token,
      code:  req.params.code  ?? req.body?.code,
      name:  req.body?.name,
      existingVolunteerId: req.guest?.id ?? null,
    });

    const token = jwt.sign(
      { id: volunteer.id, role: 'guest' },
      process.env.JWT_SECRET,
      { expiresIn: `${SESSION_HOURS}h` },
    );

    res.cookie(AUTH_COOKIE, token, {
      ...authCookieOptions(),
      maxAge: sessionMaxAge(SESSION_HOURS),
    });

    return res.status(201).json({
      success: true,
      data: {
        user: { id: volunteer.id, firstName: volunteer.full_name, role: 'guest' },
        slip,
      },
    });
  } catch (error) {
    return handle(res, error, '[slip:claim]', 'Could not start that pallet.');
  }
};

// Entry path 3: an already-signed-in guest picking off the list. No
// token and no cookie minting — they already have a session.
const claimById = async (req, res) => {
  try {
    const data = await slipAccessService.claimById(req.user, Number(req.params.id));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handle(res, error, '[slip:claim-by-id]', 'Could not start that pallet.');
  }
};

const listAvailable = async (req, res) => {
  try {
    const data = await slipAccessService.listAvailable();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handle(res, error, '[slip:available]', 'Could not load today’s pallets.');
  }
};

const getMySlip = async (req, res) => {
  try {
    const data = await slipAccessService.getMySlip(req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handle(res, error, '[slip:mine]', 'Could not load your pallet.');
  }
};

const confirmItem = async (req, res) => {
  try {
    const data = await slipAccessService.confirmItem(
      req.user, Number(req.params.id), Number(req.params.itemId),
      { packedQuantity: req.body?.packedQuantity },
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handle(res, error, '[slip:confirm]', 'Could not save that item.');
  }
};

const flagItem = async (req, res) => {
  try {
    const data = await slipAccessService.flagItem(
      req.user, Number(req.params.id), Number(req.params.itemId),
      { reason: req.body?.reason, packedQuantity: req.body?.packedQuantity },
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handle(res, error, '[slip:flag]', 'Could not flag that item.');
  }
};

const completeSlip = async (req, res) => {
  try {
    const data = await slipAccessService.completeSlip(
      req.user, Number(req.params.id), { palletRef: req.body?.palletRef },
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handle(res, error, '[slip:complete]', 'Could not finish that pallet.');
  }
};

export default {
  getPreviewByToken,
  getPreviewByShortCode,
  claim,
  claimById,
  listAvailable,
  getMySlip,
  confirmItem,
  flagItem,
  completeSlip,
};
