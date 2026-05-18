import jwt from 'jsonwebtoken';

// ─────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE
// Sits between the route and the controller on protected routes.
// If the token is missing or invalid, the request is blocked here
// and the controller never runs.
//
// Usage in index.js:
//   import auth from './middleware/auth.middleware.js'
//   app.get('/api/deliveries', auth, deliveriesController)
// ─────────────────────────────────────────────────────────────

const auth = (req, res, next) => {
  // 1. Pull the token out of the Authorization header
  //    Frontend sends it as:  Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  // 2. No token — block the request immediately
  if (!token) {
    return res.status(401).json({ message: 'Access denied. Please log in.' });
  }

  try {
    // 3. Verify the token is real and hasn't expired or been tampered with
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Attach the decoded user info to the request object
    //    Controllers can now access req.user.id, req.user.role, etc.
    //    This means we NEVER trust user IDs from req.body — we read from here instead
    req.user = decoded;

    // 5. All good — pass control to the controller
    next();

  } catch (err) {
    // Token is expired or was tampered with
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
};

export default auth;
