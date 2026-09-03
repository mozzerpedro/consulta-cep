import { Router } from 'express';
import { consultarCep } from '../services/cep.service.js';

export const cepRoutes = Router();

cepRoutes.get('/:cep', async (req, res, next) => {
  try {
    const endereco = await consultarCep(req.params.cep);
    res.json({ data: endereco });
  } catch (error) {
    next(error);
  }
});
