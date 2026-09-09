import express from 'express';
import cookieParser from 'cookie-parser';
import pendingDonationRouter from '../../src/routes/pendingDonation.routes.js';

export const buildPendingDonationApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/donations', pendingDonationRouter);
  return app;
};
