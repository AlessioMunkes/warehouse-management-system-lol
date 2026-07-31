// ─────────────────────────────────────────────────────────────
// server/__tests__/setup.js
//
// Runs before every test file. Provides a JWT_SECRET so the real
// login route / auth middleware can sign and verify tokens without
// needing a .env file present in CI.
// ─────────────────────────────────────────────────────────────
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.NODE_ENV = 'test';
