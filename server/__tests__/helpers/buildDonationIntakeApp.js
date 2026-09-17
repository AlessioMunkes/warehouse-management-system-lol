// server/test/helpers/buildDonationIntakeApp.js
//
// Wires up the standalone donationIntake.routes.js test controller —
// NOT the real receiving flow (that's donation.routes.js). Real
// service, real DB, no mocking.
import express              from 'express';
import cookieParser         from 'cookie-parser';
import donationIntakeRouter from '../../src/routes/donationIntake.routes.js';

export const buildDonationIntakeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/donations', donationIntakeRouter);
  return app;
};