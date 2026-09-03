import { Router } from 'express';
import { consultarCep, invalidarCep } from '../services/cep.service.js';

export const cepRoutes = Router();

cepRoutes.get('/:cep', async (req, res, next) => {
  try {
    const { endereco, origem } = await consultarCep(req.params.cep);

    // Header informativo: dá para conferir se o cache pegou sem mudar o corpo.
    res.set('X-Cache', origem === 'cache' ? 'HIT' : 'MISS');
    res.json({ data: endereco });
  } catch (error) {
    next(error);
  }
});

cepRoutes.delete('/:cep', async (req, res, next) => {
  try {
    const resultado = await invalidarCep(req.params.cep);
    res.json({ data: resultado });
  } catch (error) {
    next(error);
  }
});
