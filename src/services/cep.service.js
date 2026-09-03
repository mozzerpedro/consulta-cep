import { AppError } from '../lib/AppError.js';
import { formatCep, isValidCep, sanitizeCep } from '../lib/cep.js';
import { fetchCepFromViaCep } from './viacep.service.js';

/** String vazia ou só espaços vira null. */
function orNull(value) {
  const text = typeof value === 'string' ? value.trim() : value;
  return text ? text : null;
}

/** Traduz o payload do ViaCEP para o contrato da nossa API. */
export function toEndereco(raw) {
  const cep = sanitizeCep(raw.cep);

  return {
    cep,
    cepFormatado: formatCep(cep),
    logradouro: orNull(raw.logradouro),
    complemento: orNull(raw.complemento),
    bairro: orNull(raw.bairro),
    cidade: orNull(raw.localidade),
    estado: orNull(raw.estado),
    uf: orNull(raw.uf),
    regiao: orNull(raw.regiao),
    ibge: orNull(raw.ibge),
    ddd: orNull(raw.ddd),
  };
}

/**
 * Consulta um CEP e devolve o endereço já normalizado.
 * @param {string} input CEP com ou sem máscara
 */
export async function consultarCep(input) {
  const cep = sanitizeCep(input);

  if (!isValidCep(cep)) {
    throw new AppError(400, 'invalid_cep', 'O CEP deve conter 8 dígitos numéricos.');
  }

  const raw = await fetchCepFromViaCep(cep);
  return toEndereco(raw);
}
