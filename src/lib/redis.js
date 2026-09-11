import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_ENABLED = (process.env.REDIS_ENABLED ?? 'true') !== 'false';
const OP_TIMEOUT_MS = Number(process.env.REDIS_TIMEOUT_MS ?? 1000);

// O cache é um acelerador, não uma dependência: se o Redis cair, a API continua
// respondendo pelo ViaCEP. Por isso todo erro deste módulo vira log, não exceção.

/** @type {import('redis').RedisClientType | null} */
let client = null;
/** @type {Promise<unknown> | null} */
let connecting = null;
let lastErrorLogged = null;

function logOnce(message, error) {
  const key = `${message}:${error?.message ?? ''}`;
  if (key === lastErrorLogged) return;
  lastErrorLogged = key;
  console.warn(`[redis] ${message}`, error?.message ?? '');
}

const TIMED_OUT = Symbol('timeout');

/** Nenhuma operação de cache pode segurar a request além de `ms`. */
function withTimeout(promise, ms = OP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    timer.unref?.(); // não segura o event loop no shutdown
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); resolve(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}

function buildClient() {
  const instance = createClient({
    url: REDIS_URL,
    socket: {
      // Sem desistir: assim que o Redis voltar, o cache volta sozinho.
      reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
    },
  });

  // Sem este listener um erro de socket vira unhandled error e derruba o processo.
  instance.on('error', (error) => logOnce('conexão indisponível', error));
  instance.on('ready', () => {
    lastErrorLogged = null;
    console.log(`[redis] conectado em ${REDIS_URL}`);
  });

  return instance;
}

/** Client pronto, ou `null` se o Redis está desligado, fora ou ainda conectando. */
export async function getRedis() {
  if (!REDIS_ENABLED) return null;

  if (!client) client = buildClient();
  if (client.isReady) return client;

  if (!connecting) {
    // Socket já aberto sem `connecting` = reconexão em andamento; chamar
    // connect() de novo lançaria "Socket already opened".
    if (client.isOpen) return null;

    // connect() com reconnectStrategy infinita pode nunca resolver — por isso
    // ela fica viva em background e quem espera é o withTimeout abaixo.
    connecting = client.connect().catch((error) => logOnce('falha ao conectar', error));
    connecting.finally(() => { connecting = null; });
  }

  await withTimeout(connecting);

  return client.isReady ? client : null;
}

/** Devolve `null` em qualquer falha: miss, Redis fora, timeout ou JSON corrompido. */
export async function cacheGet(key) {
  try {
    const redis = await getRedis();
    if (!redis) return null;

    const raw = await withTimeout(redis.get(key));
    if (raw === TIMED_OUT || raw instanceof Error) {
      logOnce('falha ao ler do cache', raw === TIMED_OUT ? new Error('timeout') : raw);
      return null;
    }

    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    logOnce('falha ao ler do cache', error);
    return null;
  }
}

/** `ttlSeconds` omitido ou <= 0 grava sem expiração. */
export async function cacheSet(key, value, ttlSeconds) {
  try {
    const redis = await getRedis();
    if (!redis) return false;

    // `EX` direto está deprecado no node-redis 6 — a forma atual é `expiration`.
    const options =
      Number.isFinite(ttlSeconds) && ttlSeconds > 0
        ? { expiration: { type: 'EX', value: Math.floor(ttlSeconds) } }
        : undefined;

    const result = await withTimeout(redis.set(key, JSON.stringify(value), options));
    if (result === TIMED_OUT || result instanceof Error) {
      logOnce('falha ao gravar no cache', result === TIMED_OUT ? new Error('timeout') : result);
      return false;
    }

    return true;
  } catch (error) {
    logOnce('falha ao gravar no cache', error);
    return false;
  }
}

export async function cacheDel(key) {
  try {
    const redis = await getRedis();
    if (!redis) return false;

    const removidos = await withTimeout(redis.del(key));
    if (removidos === TIMED_OUT || removidos instanceof Error) {
      logOnce('falha ao remover do cache', removidos === TIMED_OUT ? new Error('timeout') : removidos);
      return false;
    }

    return removidos > 0;
  } catch (error) {
    logOnce('falha ao remover do cache', error);
    return false;
  }
}

export function redisStatus() {
  if (!REDIS_ENABLED) return 'disabled';
  if (client?.isReady) return 'ready';
  return 'unavailable';
}

export async function closeRedis() {
  if (!client) return;

  const instancia = client;
  client = null;
  connecting = null;

  try {
    if (instancia.isOpen) await withTimeout(instancia.quit());
  } finally {
    // destroy() lança se o client já fechou, então só serve se o quit falhou.
    if (instancia.isOpen) instancia.destroy();
  }
}
