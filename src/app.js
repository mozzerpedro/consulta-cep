import express from 'express';
import { cepRoutes } from './routes/cep.routes.js';
import { errorHandler, notFoundHandler } from './lib/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/cep', cepRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
