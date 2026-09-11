import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { startFakeViaCep } from './helpers/fake-viacep.js';
import { startFakeRedis } from './helpers/fake-redis.js';

let consultarCep;
let invalidarCep;
let closeRedis;
let viacep;
let redis;

before(async () => {
  viacep = await startFakeViaCep();
  redis = await startFakeRedis();

  process.env.VIACEP_BASE_URL = viacep.baseUrl;
  process.env.REDIS_URL = redis.url;
  process.env.REDIS_TTL_SECONDS = '86400';

  ({ consultarCep, invalidarCep } = await import('../src/services/cep.service.js'));
  ({ closeRedis } = await import('../src/lib/redis.js'));
});

after(async () => {
  await closeRedis();
  await Promise.all([viacep.close(), redis.close()]);
});

beforeEach(() => {
  redis.store.clear();
});

/** A gravação no cache é fire-and-forget; espera ela chegar no Redis. */
async function aguardarGravacao(chave) {
  for (let i = 0; i < 50 && !redis.store.has(chave); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('consultarCep - validação', () => {
  test('CEP com menos de 8 dígitos vira 400 antes de qualquer I/O', async () => {
    const chamadasAntes = viacep.chamadas;

    await assert.rejects(
      () => consultarCep('123'),
      (erro) => erro.status === 400 && erro.code === 'invalid_cep',
    );

    assert.equal(viacep.chamadas, chamadasAntes, 'não deveria ter chamado o ViaCEP');
  });
});

describe('consultarCep - cache', () => {
  test('primeira consulta é MISS e busca no ViaCEP', async () => {
    const chamadasAntes = viacep.chamadas;
    const { endereco, origem } = await consultarCep('80010-010');

    assert.equal(origem, 'viacep');
    assert.equal(endereco.cidade, 'Curitiba');
    assert.equal(viacep.chamadas, chamadasAntes + 1);
  });

  test('segunda consulta é HIT e não toca no ViaCEP', async () => {
    await consultarCep('80010010');
    await aguardarGravacao('cep:80010010');

    const chamadasAntes = viacep.chamadas;
    const { endereco, origem } = await consultarCep('80010010');

    assert.equal(origem, 'cache');
    assert.equal(viacep.chamadas, chamadasAntes, 'o cache deveria ter evitado a chamada');
    assert.equal(endereco.cidade, 'Curitiba');
  });

  test('com e sem máscara caem na mesma chave', async () => {
    await consultarCep('80010010');
    await aguardarGravacao('cep:80010010');

    const { origem } = await consultarCep('80010-010');

    assert.equal(origem, 'cache');
    assert.equal(redis.store.size, 1);
  });

  test('o HIT devolve exatamente o mesmo endereço do MISS', async () => {
    const primeira = await consultarCep('80010010');
    await aguardarGravacao('cep:80010010');
    const segunda = await consultarCep('80010010');

    assert.deepEqual(segunda.endereco, primeira.endereco);
  });

  test('grava o payload cru, não o endereço normalizado', async () => {
    await consultarCep('80010010');
    await aguardarGravacao('cep:80010010');

    const gravado = JSON.parse(redis.store.get('cep:80010010').valor);

    assert.equal(gravado.localidade, 'Curitiba', 'payload cru mantém localidade');
    assert.equal(gravado.siafi, '7535', 'e mantém os campos internos');
    assert.equal('cidade' in gravado, false, 'não é o formato da nossa API');
  });

  test('grava com TTL de 24h', async () => {
    await consultarCep('80010010');
    await aguardarGravacao('cep:80010010');

    assert.deepEqual(redis.ultimoComando('SET').slice(-2), ['EX', '86400']);
    assert.equal(redis.ttl('cep:80010010'), 86400);
  });

  test('CEP inexistente não é cacheado', async () => {
    await assert.rejects(
      () => consultarCep('00000000'),
      (erro) => erro.status === 404 && erro.code === 'cep_not_found',
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(redis.store.has('cep:00000000'), false);
  });

  test('entrada expirada volta a ser MISS', async () => {
    await consultarCep('80010010');
    await aguardarGravacao('cep:80010010');

    // Empurra a expiração para o passado, simulando as 24h decorridas.
    redis.store.get('cep:80010010').expiraEm = Date.now() - 1;

    const { origem } = await consultarCep('80010010');
    assert.equal(origem, 'viacep');
  });
});

describe('invalidarCep', () => {
  test('remove a entrada e a consulta seguinte vira MISS', async () => {
    await consultarCep('80010010');
    await aguardarGravacao('cep:80010010');

    assert.deepEqual(await invalidarCep('80010-010'), { cep: '80010010', removido: true });
    assert.equal(redis.store.has('cep:80010010'), false);

    const { origem } = await consultarCep('80010010');
    assert.equal(origem, 'viacep');
  });

  test('CEP que não estava no cache devolve removido: false', async () => {
    assert.deepEqual(await invalidarCep('99999999'), { cep: '99999999', removido: false });
  });

  test('CEP inválido vira 400', async () => {
    await assert.rejects(
      () => invalidarCep('abc'),
      (erro) => erro.status === 400 && erro.code === 'invalid_cep',
    );
  });
});
