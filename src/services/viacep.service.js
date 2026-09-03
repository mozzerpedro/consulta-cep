import { AppError } from '../lib/AppError.js';

const BASE_URL = process.env.VIACEP_BASE_URL ?? 'https://viacep.com.br/ws';
const TIMEOUT_MS = Number(process.env.VIACEP_TIMEOUT_MS ?? 5000);

/**
 * Consulta o ViaCEP e devolve o payload cru.
 * @param {string} cep 8 dígitos, já sanitizado
 */
export async function fetchCepFromViaCep(cep) {
  let response;

  try {
    response = await fetch(`${BASE_URL}/${cep}/json/`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new AppError(504, 'upstream_timeout', 'O ViaCEP não respondeu dentro do tempo limite.');
    }
    throw new AppError(502, 'upstream_unavailable', 'Não foi possível se comunicar com o ViaCEP.');
  }

  // O ViaCEP devolve 400 quando o formato do CEP não é aceito.
  if (response.status === 400) {
    throw new AppError(400, 'invalid_cep', 'CEP em formato inválido.');
  }

  if (!response.ok) {
    throw new AppError(502, 'upstream_error', `O ViaCEP respondeu com status ${response.status}.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new AppError(502, 'upstream_invalid_response', 'O ViaCEP devolveu uma resposta ilegível.');
  }

  // CEP inexistente vem como { "erro": true } ou { "erro": "true" }.
  if (data?.erro) {
    throw new AppError(404, 'cep_not_found', 'CEP não encontrado.');
  }

  return data;
}
