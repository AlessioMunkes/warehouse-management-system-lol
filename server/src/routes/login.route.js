import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import pool from '../config/db.js'

const router = express.Router()


router.post('/', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }


    const result = await pool.query(
      `SELECT id, username, first_name, last_name, role, password_hash
       FROM users
       WHERE username = $1`,
      [username.toUpperCase()]
    );

    if (result.rows.length === 0) {
      // Use the same message for wrong username OR wrong password
      // (never tell the user which one is wrong — security best practice)
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash)

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' })
    }
    // Sign a JWT token with the user's id and role
    // The frontend stores this and sends it as a header on every future request
    // expiresIn: '8h' — token expires after an 8 hour shift
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Return the token + safe user info (never return password_hash)
    res.json({
      success: true,
      token,
      user: {
        id:        user.id,
        username:  user.username,
        firstName: user.first_name,
        lastName:  user.last_name,
        role:      user.role,
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});


export default router


// ─────────────────────────────────────────────────────────────
// HOW TO PROTECT YOUR OTHER ROUTES
//
// Now that auth middleware exists, add it to any route that
// should require a logged-in user:
//
//   app.get('/api/deliveries', auth, async (req, res) => { ... })
//   app.post('/api/purchase-orders', auth, async (req, res) => { ... })
//
// And replace any req.body.worker_id or req.body.created_by with:
//   const userId = req.user.id   ← comes from the verified JWT
// ─────────────────────────────────────────────────────────────
