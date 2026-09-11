import express from 'express';
import cors from 'cors';

import { cepRoutes } from './routes/cep.routes.js';
import { errorHandler, notFoundHandler } from './lib/errorHandler.js';
import { rateLimiter } from './lib/rateLimiter.js';
import { redisStatus } from './lib/redis.js';

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
const TRUST_PROXY = process.env.TRUST_PROXY;

/** `*` libera geral; senão, lista de origens separadas por vírgula. */
function origensPermitidas() {
  if (CORS_ORIGIN === '*') return '*';
  return CORS_ORIGIN.split(',').map((origem) => origem.trim()).filter(Boolean);
}

export function createApp() {
  const app = express();

  // Atrás de proxy o req.ip é o do proxy, e todo mundo cairia no mesmo balde
  // do rate limit. Só ligue isto se houver mesmo um proxy na frente.
  if (TRUST_PROXY) {
    app.set('trust proxy', Number.isNaN(Number(TRUST_PROXY)) ? TRUST_PROXY : Number(TRUST_PROXY));
  }

  app.use(cors({ origin: origensPermitidas(), methods: ['GET', 'DELETE'] }));
  app.use(express.json());

  // Fora do rate limit: health check de orquestrador bate com frequência.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), redis: redisStatus() });
  });

  app.use('/cep', rateLimiter, cepRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
