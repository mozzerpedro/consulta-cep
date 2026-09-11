import { rateLimit } from 'express-rate-limit';
import { AppError } from './AppError.js';

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX = Number(process.env.RATE_LIMIT_MAX ?? 60);

const segundos = Math.round(WINDOW_MS / 1000);

export const rateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX,
  standardHeaders: 'draft-7', // header combinado: `RateLimit: limit=60, remaining=59, reset=60`
  legacyHeaders: false,

  // Delegar ao errorHandler mantém o 429 no mesmo formato dos outros erros,
  // em vez do "Too many requests" em texto puro que vem por padrão.
  handler: (req, res, next) => {
    next(
      new AppError(
        429,
        'rate_limit_exceeded',
        `Limite de ${MAX} requisições a cada ${segundos}s excedido. Tente de novo em instantes.`,
      ),
    );
  },
});
