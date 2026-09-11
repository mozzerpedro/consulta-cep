import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startFakeViaCep } from './helpers/fake-viacep.js';

// Testes de HTTP de verdade: sobe o app numa porta efêmera e usa fetch.
// Sem cache aqui — o alvo são os middlewares, não o Redis.

const LIMITE = 3;

let servidor;
let base;
let viacep;

before(async () => {
  viacep = await startFakeViaCep();

  process.env.VIACEP_BASE_URL = viacep.baseUrl;
  process.env.REDIS_ENABLED = 'false';
  process.env.RATE_LIMIT_MAX = String(LIMITE);
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  process.env.CORS_ORIGIN = '*';

  const { createApp } = await import('../src/app.js');
  servidor = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  servidor.closeAllConnections();
  await new Promise((resolve) => servidor.close(resolve));
  await viacep.close();
});

describe('CORS', () => {
  test('libera a origem na resposta do GET', async () => {
    const res = await fetch(`${base}/cep/80010010`, { headers: { Origin: 'https://meusite.com' } });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  test('responde ao preflight com os métodos permitidos', async () => {
    const res = await fetch(`${base}/cep/80010010`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://meusite.com',
        'Access-Control-Request-Method': 'DELETE',
      },
    });

    assert.ok(res.status === 204 || res.status === 200, `status inesperado: ${res.status}`);
    assert.match(res.headers.get('access-control-allow-methods') ?? '', /DELETE/);
  });

  test('preflight não consome a cota do rate limit', async () => {
    const res = await fetch(`${base}/cep/80010010`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://meusite.com', 'Access-Control-Request-Method': 'GET' },
    });

    assert.equal(res.headers.has('ratelimit'), false);
  });
});

describe('rate limit', () => {
  test('expõe os headers padrão do draft-7', async () => {
    const res = await fetch(`${base}/cep/80010010`);

    // draft-7 usa um header só: `RateLimit: limit=3, remaining=2, reset=60`.
    assert.match(res.headers.get('ratelimit') ?? '', new RegExp(`limit=${LIMITE}`));
    assert.match(res.headers.get('ratelimit') ?? '', /remaining=\d+/);
    assert.equal(res.headers.get('ratelimit-policy'), `${LIMITE};w=60`);
    assert.equal(res.headers.has('x-ratelimit-limit'), false, 'os headers legados ficam desligados');
  });

  test('bloqueia com 429 no formato de erro da API', async () => {
    // A cota já foi parcialmente gasta pelos testes acima; estoura de vez.
    let res;
    for (let i = 0; i < LIMITE + 2; i++) {
      res = await fetch(`${base}/cep/80010010`);
    }

    assert.equal(res.status, 429);

    const body = await res.json();
    assert.equal(body.error.code, 'rate_limit_exceeded');
    assert.match(body.error.message, /Limite de 3 requisições/);
    assert.equal('data' in body, false);
  });

  test('/health continua respondendo mesmo com a cota estourada', async () => {
    const res = await fetch(`${base}/health`);

    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
    assert.equal(res.headers.has('ratelimit'), false, '/health fica fora do limite');
  });
});

describe('contrato de erro', () => {
  test('rota inexistente segue devolvendo route_not_found', async () => {
    const res = await fetch(`${base}/nao-existe`);

    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'route_not_found');
  });
});
