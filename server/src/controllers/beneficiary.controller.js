// ─────────────────────────────────────────────────────────────
// server/src/controllers/beneficiary.controller.js
//
// Thin HTTP layer, same respondError pattern as every other
// controller in this codebase.
// ─────────────────────────────────────────────────────────────
import beneficiaryService from '../services/beneficiary.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

// ── GET /api/beneficiaries?includeInactive=&search= ─────────────
const list = async (req, res) => {
  try {
    const data = await beneficiaryService.listBeneficiaries({
      includeInactive: req.query.includeInactive,
      search: req.query.search,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listBeneficiaries', 'Failed to retrieve beneficiaries.');
  }
};

// ── GET /api/beneficiaries/:id ───────────────────────────────────
const getOne = async (req, res) => {
  try {
    const data = await beneficiaryService.getBeneficiary(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getBeneficiary', 'Failed to retrieve beneficiary.');
  }
};

// ── POST /api/beneficiaries ──────────────────────────────────────
const register = async (req, res) => {
  try {
    const data = await beneficiaryService.createBeneficiary(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'createBeneficiary', 'Failed to create beneficiary.');
  }
};

// ── PATCH /api/beneficiaries/:id ─────────────────────────────────
const update = async (req, res) => {
  try {
    const data = await beneficiaryService.updateBeneficiary(req.params.id, req.body);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'updateBeneficiary', 'Failed to update beneficiary.');
  }
};

// ── PATCH /api/beneficiaries/:id/status ──────────────────────────
const setStatus = async (req, res) => {
  try {
    const data = await beneficiaryService.setBeneficiaryStatus(req.params.id, req.body);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'setBeneficiaryStatus', 'Failed to change beneficiary status.');
  }
};

// ── PATCH /api/beneficiaries/:id/approve ─────────────────────────
const approve = async (req, res) => {
  try {
    const data = await beneficiaryService.approveBeneficiary(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'approveBeneficiary', 'Failed to approve beneficiary.');
  }
};

// ── PATCH /api/beneficiaries/:id/rollback-cohort ──────────────────
const rollbackCohort = async (req, res) => {
  try {
    const data = await beneficiaryService.rollbackCohort(req.params.id, req.user?.id);
    if (!data) {
      res.status(404).json({ success: false, message: 'Beneficiary not found.' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'rollbackCohort', 'Failed to move this beneficiary to the other cohort.');
  }
};

export default {
  list,
  getOne,
  register,
  update,
  setStatus,
  approve,
  rollbackCohort,
};
