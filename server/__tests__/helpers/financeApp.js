import express from 'express';
import cookieParser from 'cookie-parser';
import financeRouter from '../../src/routes/finance.routes.js';

export const buildFinanceApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/finance', financeRouter);
  return app;
};
