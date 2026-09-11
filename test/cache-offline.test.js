import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startFakeViaCep } from './helpers/fake-viacep.js';

// A propriedade que mais importa: com o Redis fora, a API continua respondendo.
// Este arquivo roda em processo próprio, então aponta o REDIS_URL para uma porta
// fechada sem afetar os outros testes.

let consultarCep;
let invalidarCep;
let redisStatus;
let closeRedis;
let viacep;

before(async () => {
  viacep = await startFakeViaCep();

  process.env.VIACEP_BASE_URL = viacep.baseUrl;
  process.env.REDIS_URL = 'redis://127.0.0.1:1'; // porta fechada
  process.env.REDIS_TIMEOUT_MS = '200';

  ({ consultarCep, invalidarCep } = await import('../src/services/cep.service.js'));
  ({ redisStatus, closeRedis } = await import('../src/lib/redis.js'));
});

after(async () => {
  await closeRedis();
  await viacep.close();
});

describe('Redis indisponível', () => {
  test('a consulta funciona normalmente, sempre pelo ViaCEP', async () => {
    const { endereco, origem } = await consultarCep('80010-010');

    assert.equal(origem, 'viacep');
    assert.equal(endereco.cidade, 'Curitiba');
  });

  test('nunca vira HIT, mesmo repetindo a consulta', async () => {
    const primeira = await consultarCep('80010010');
    const segunda = await consultarCep('80010010');

    assert.equal(primeira.origem, 'viacep');
    assert.equal(segunda.origem, 'viacep');
  });

  test('o cache não segura a request além do timeout configurado', async () => {
    const inicio = Date.now();
    await consultarCep('80010010');
    const decorrido = Date.now() - inicio;

    assert.ok(decorrido < 2000, `demorou ${decorrido}ms — o cache não deveria bloquear`);
  });

  test('erros do ViaCEP continuam chegando intactos ao cliente', async () => {
    await assert.rejects(
      () => consultarCep('00000000'),
      (erro) => erro.status === 404 && erro.code === 'cep_not_found',
    );
  });

  test('a validação de CEP não depende do cache', async () => {
    await assert.rejects(
      () => consultarCep('123'),
      (erro) => erro.status === 400 && erro.code === 'invalid_cep',
    );
  });

  test('invalidarCep devolve removido: false em vez de estourar', async () => {
    assert.deepEqual(await invalidarCep('80010010'), { cep: '80010010', removido: false });
  });

  test('redisStatus reporta unavailable', () => {
    assert.equal(redisStatus(), 'unavailable');
  });
});

describe('REDIS_ENABLED=false', () => {
  test('desliga o cache sem afetar a consulta', async () => {
    process.env.REDIS_ENABLED = 'false';
    const redis = await import('../src/lib/redis.js?disabled');
    process.env.REDIS_ENABLED = 'true';

    assert.equal(redis.redisStatus(), 'disabled');
    assert.equal(await redis.getRedis(), null);
    assert.equal(await redis.cacheGet('cep:80010010'), null);
    assert.equal(await redis.cacheSet('cep:80010010', {}), false);
  });
});
