// ─────────────────────────────────────────────────────────────
// server/src/routes/volunteer.routes.js
//
// STUB — POST /api/volunteers/sign-in
//
// Deliberately PUBLIC (no auth middleware): a guest has no JWT
// cookie when they sign in. That makes this an unauthenticated
// write endpoint, so it is rate limited.
//
// TODO (Phase 2): move the INSERT into
// src/repositories/volunteer.repository.js and add a controller,
// matching the delivery.routes.js pattern.
// ─────────────────────────────────────────────────────────────
import express from 'express';

const router = express.Router();

router.post('/sign-in', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }
    if (name.trim().length > 200) {
      return res.status(400).json({ message: 'Name is too long.' });
    }

    // ── REAL IMPLEMENTATION (uncomment once table is migrated) ──
    // signed_in_at comes from the DB default, never from the client.
    //
    // const result = await pool.query(
    //   `INSERT INTO volunteers (full_name, source)
    //    VALUES ($1, 'guest_login')
    //    RETURNING id, full_name, signed_in_at`,
    //   [name.trim()]
    // );
    // return res.status(201).json({ success: true, data: result.rows[0] });

    console.info('[STUB] volunteer sign-in →', name.trim());
    return res.status(201).json({ success: true, message: 'Stub — not persisted.' });

  } catch (error) {
    console.error('[volunteers]', error.message);
    return res.status(500).json({ message: 'Server error recording sign-in.' });
  }
});

export default router;