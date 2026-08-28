// server/test/helpers/testAuth.js
//
// Signs real JWTs with the app's actual JWT_SECRET so requests carry
// a cookie that auth.middleware.js genuinely verifies — real
// jwt.verify(), not a mocked req.user.
import jwt from 'jsonwebtoken';

export const signTestToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not set — check test/setup.js loads .env.test.');
  }
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

export const authCookie = (user) => `wms_token=${signTestToken(user)}`;