// server/test/helpers/buildDonationAdminApp.js
//
// Mirrors index.js without app.listen(). Unlike buildPickingApp.js,
// does NOT mock the service layer — real DB, end to end.
import express             from 'express';
import cookieParser        from 'cookie-parser';
import donationAdminRouter from '../../src/routes/donationAdmin.routes';

export const buildDonationAdminApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/donations/admin', donationAdminRouter);
  return app;
};