import decantingService from '../services/decanting.service.js';

// POST /api/decanting/calculate
const calculatePlan = async (req, res) => {
  try {
    const result = decantingService.calculateDecantingPlan(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[calculatePlan]', err.message);
    const isValidationError = (msg) =>
    msg.includes('required') || msg.includes('must be') || msg.includes('cannot exceed');
    const status = isValidationError(err.message) ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// POST /api/decanting
const recordDecanting = async (req, res) => {
  try {
    const record = await decantingService.recordDecanting(req.body, req.user.id);
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error('[recordDecanting]', err.message);
    const isValidationError = (msg) =>
    msg.includes('required') || msg.includes('must be') || msg.includes('cannot exceed');
    const status = isValidationError(err.message) ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// GET /api/decanting?range=today|week|month|all
const getRecords = async (req, res) => {
  try {
    const range   = req.query.range || 'all';
    const records = await decantingService.getDecantingRecords(range);
    res.json({ success: true, data: records });
  } catch (err) {
    console.error('[getRecords]', err.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve decanting records.' });
  }
};

// GET /api/decanting/:id
const getById = async (req, res) => {
  try {
    const record = await decantingService.getDecantingById(req.params.id);
    res.json({ success: true, data: record });
  } catch (err) {
    console.error('[getById]', err.message);
    const status = err.message === 'Decanting record not found.' ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// GET /api/decanting/report?weekOf=YYYY-MM-DD
const getWeeklyReport = async (req, res) => {
  try {
    const report = await decantingService.getWeeklyProcurementReport(req.query.weekOf);
    res.json({ success: true, data: report });
  } catch (err) {
    console.error('[getWeeklyReport]', err.message);
    const status = err.message.includes('required') ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// GET /api/decanting/products
// const getDecantableProducts = async (req, res) => {
//   try {
//     const products = await decantingService.getDecantableProducts();
//     res.json({ success: true, data: products });
//   } catch (err) {
//     console.error('[getDecantableProducts]', err.message);
//     res.status(500).json({ success: false, message: 'Failed to retrieve decantable products.' });
//   }
// };

// GET /api/decanting/:id/export — downloads the decanting sheet as CSV
const exportSheet = async (req, res) => {
  try {
    const { filename, csv } = await decantingService.exportDecantingSheet(req.params.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error('[exportSheet]', err.message);
    const status = err.message === 'Decanting record not found.' ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

export default {
  calculatePlan,
  recordDecanting,
  getRecords,
  getById,
  getWeeklyReport,
// getDecantableProducts,
  exportSheet,

};