import { AppError } from '../lib/AppError.js';
import { formatCep, isValidCep, sanitizeCep } from '../lib/cep.js';
import { cacheDel, cacheGet, cacheSet } from '../lib/redis.js';
import { fetchCepFromViaCep } from './viacep.service.js';

const CACHE_PREFIX = process.env.REDIS_KEY_PREFIX ?? 'cep:';

/** 24 horas. Endereço de CEP muda pouco, mas não nunca. */
const CACHE_TTL_SECONDS = Number(process.env.REDIS_TTL_SECONDS ?? 86400);

/** "80010010" -> "cep:80010010" */
export function cacheKey(cep) {
  return `${CACHE_PREFIX}${cep}`;
}

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
 *
 * O cache guarda o payload cru do ViaCEP, não o endereço normalizado: assim,
 * se o contrato da nossa API mudar, `toEndereco` passa a valer para os dados
 * já cacheados sem precisar invalidar nada. Cada entrada expira em
 * `REDIS_TTL_SECONDS` (24h por padrão).
 *
 * @param {string} input CEP com ou sem máscara
 * @returns {Promise<{ endereco: object, origem: 'cache' | 'viacep' }>}
 */
export async function consultarCep(input) {
  const cep = sanitizeCep(input);

  if (!isValidCep(cep)) {
    throw new AppError(400, 'invalid_cep', 'O CEP deve conter 8 dígitos numéricos.');
  }

  const cached = await cacheGet(cacheKey(cep));
  if (cached) {
    return { endereco: toEndereco(cached), origem: 'cache' };
  }

  const raw = await fetchCepFromViaCep(cep);

  // Expira em 24h: correções dos Correios entram sozinhas no dia seguinte,
  // sem depender de alguém lembrar de invalidar a chave na mão.
  // A escrita não bloqueia a resposta nem derruba a request se o Redis falhar.
  cacheSet(cacheKey(cep), raw, CACHE_TTL_SECONDS);

  return { endereco: toEndereco(raw), origem: 'viacep' };
}

/**
 * Remove um CEP do cache, forçando a releitura antes do TTL expirar.
 * @param {string} input CEP com ou sem máscara
 */
export async function invalidarCep(input) {
  const cep = sanitizeCep(input);

  if (!isValidCep(cep)) {
    throw new AppError(400, 'invalid_cep', 'O CEP deve conter 8 dígitos numéricos.');
  }

  const removido = await cacheDel(cacheKey(cep));
  return { cep, removido };
}
