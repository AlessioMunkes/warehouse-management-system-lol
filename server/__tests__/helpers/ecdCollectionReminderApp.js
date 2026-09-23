import express from 'express';
import cookieParser from 'cookie-parser';
import reminderRouter from '../../src/routes/ecdCollectionReminder.routes.js';

export const buildEcdCollectionReminderApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/collection-reminders', reminderRouter);
  return app;
};
