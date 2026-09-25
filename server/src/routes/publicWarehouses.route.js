// ─────────────────────────────────────────────────────────────
// server/src/routes/publicWarehouses.route.js
//
// GET /api/public/warehouses — no login.
//
// The volunteer sign-in page needs to know whether to ask "which
// warehouse are you at?". It gets the list of sites (code and display
// name) and nothing else: no counts, no addresses, nothing from any
// database. With one database it answers multiWarehouse:false and an
// empty list, and the page asks nothing.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import { isMultiWarehouse, warehouseCodes, warehouseName } from '../config/warehouses.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    success: true,
    multiWarehouse: isMultiWarehouse(),
    warehouses: warehouseCodes().map((code) => ({ code, name: warehouseName(code) })),
  });
});

export default router;
