import { AppError } from './AppError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'route_not_found', message: `Rota não encontrada: ${req.method} ${req.originalUrl}` },
  });
}

// A assinatura com 4 parâmetros é obrigatória para o Express reconhecer
// isto como middleware de erro — não remover o `next`.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
  }

  console.error('Erro inesperado:', error);

  return res.status(500).json({
    error: { code: 'internal_error', message: 'Erro interno no servidor.' },
  });
}
