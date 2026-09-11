import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { PAYLOAD_CURITIBA, PAYLOAD_PUC } from './helpers/fake-viacep.js';

let viacep;
let server;
let baseUrl;
let responder;

function responderComJson(status, corpo, atrasoMs = 0) {
  responder = (req, res) => {
    setTimeout(() => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(corpo));
    }, atrasoMs);
  };
}

async function consultar(cep) {
  const res = await fetch(`${baseUrl}/cep/${cep}`);
  return { status: res.status, body: await res.json() };
}

before(async () => {
  viacep = http.createServer((req, res) => responder(req, res));
  await new Promise((resolve) => viacep.listen(0, '127.0.0.1', resolve));

  process.env.VIACEP_BASE_URL = `http://127.0.0.1:${viacep.address().port}`;
  process.env.VIACEP_TIMEOUT_MS = '300';

  const { default: app } = await import('../src/app.js');

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  viacep.close();
});

describe('GET /health', () => {
  test('responde ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
  });
});

describe('GET /cep/:cep', () => {
  test('CEP válido retorna 200 com o endereço', async () => {
    responderComJson(200, PAYLOAD_CURITIBA);
    const { status, body } = await consultar('80010-010');

    assert.equal(status, 200);
    assert.equal(body.data.cidade, 'Curitiba');
  });

  test('CEP de grande usuário retorna 200 sem campos internos', async () => {
    responderComJson(200, PAYLOAD_PUC);
    const { status, body } = await consultar('80215-901');

    assert.equal(status, 200);
    assert.equal(body.data.cepFormatado, '80215-901');
    assert.equal(body.data.unidade, undefined);
  });

  test('formato inválido retorna 400 invalid_cep', async () => {
    const { status, body } = await consultar('123');

    assert.equal(status, 400);
    assert.equal(body.error.code, 'invalid_cep');
  });

  test('CEP inexistente retorna 404 cep_not_found', async () => {
    responderComJson(200, { erro: 'true' });
    const { status, body } = await consultar('00000000');

    assert.equal(status, 404);
    assert.equal(body.error.code, 'cep_not_found');
  });
});

describe('falhas do ViaCEP', () => {
  test('status de erro vira 502 upstream_error', async () => {
    responderComJson(500, { mensagem: 'boom' });
    const { status, body } = await consultar('80020-010');

    assert.equal(status, 502);
    assert.equal(body.error.code, 'upstream_error');
  });

  test('resposta lenta vira 504 upstream_timeout', async () => {
    responderComJson(200, {}, 800);
    const { status, body } = await consultar('80030-010');

    assert.equal(status, 504);
    assert.equal(body.error.code, 'upstream_timeout');
  });
});

describe('rota inexistente', () => {
  test('retorna 404 route_not_found', async () => {
    const res = await fetch(`${baseUrl}/naoexiste`);
    const body = await res.json();

    assert.equal(res.status, 404);
    assert.equal(body.error.code, 'route_not_found');
  });
});