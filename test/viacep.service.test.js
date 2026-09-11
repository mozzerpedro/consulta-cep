import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startFakeViaCep } from './helpers/fake-viacep.js';

// Os módulos leem process.env no topo, então o import precisa ser dinâmico e
// vir depois do env estar montado. Cada arquivo de teste roda em seu processo.
let viacep;
let fake;

before(async () => {
  fake = await startFakeViaCep();
  process.env.VIACEP_BASE_URL = fake.baseUrl;
  process.env.VIACEP_TIMEOUT_MS = '300';
  viacep = await import('../src/services/viacep.service.js');
});

after(async () => {
  await fake.close();
});

/** Roda a função e devolve o AppError lançado. */
async function capturarErro(fn) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  assert.fail('deveria ter lançado');
}

describe('fetchCepFromViaCep', () => {
  test('devolve o payload cru em caso de sucesso', async () => {
    const raw = await viacep.fetchCepFromViaCep('80010010');

    assert.equal(raw.localidade, 'Curitiba');
    assert.equal(raw.siafi, '7535', 'o payload é cru: campos internos ainda estão lá');
  });

  test('CEP inexistente vira 404 cep_not_found', async () => {
    const erro = await capturarErro(() => viacep.fetchCepFromViaCep('00000000'));

    assert.equal(erro.status, 404);
    assert.equal(erro.code, 'cep_not_found');
  });

  test('400 do ViaCEP vira 400 invalid_cep', async () => {
    const erro = await capturarErro(() => viacep.fetchCepFromViaCep('11111111'));

    assert.equal(erro.status, 400);
    assert.equal(erro.code, 'invalid_cep');
  });

  test('500 do ViaCEP vira 502 upstream_error', async () => {
    const erro = await capturarErro(() => viacep.fetchCepFromViaCep('22222222'));

    assert.equal(erro.status, 502);
    assert.equal(erro.code, 'upstream_error');
  });

  test('resposta ilegível vira 502 upstream_invalid_response', async () => {
    const erro = await capturarErro(() => viacep.fetchCepFromViaCep('33333333'));

    assert.equal(erro.status, 502);
    assert.equal(erro.code, 'upstream_invalid_response');
  });

  test('ViaCEP que não responde vira 504 upstream_timeout', async () => {
    const erro = await capturarErro(() => viacep.fetchCepFromViaCep('44444444'));

    assert.equal(erro.status, 504);
    assert.equal(erro.code, 'upstream_timeout');
  });

  test('host fora do ar vira 502 upstream_unavailable', async () => {
    // A query string força uma instância nova do módulo, que relê o env no topo.
    process.env.VIACEP_BASE_URL = 'http://127.0.0.1:1'; // porta fechada
    const { fetchCepFromViaCep } = await import('../src/services/viacep.service.js?offline');
    process.env.VIACEP_BASE_URL = fake.baseUrl;

    const erro = await capturarErro(() => fetchCepFromViaCep('80010010'));

    assert.equal(erro.status, 502);
    assert.equal(erro.code, 'upstream_unavailable');
  });
});
