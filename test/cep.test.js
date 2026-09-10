import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { formatCep, isValidCep, sanitizeCep } from '../src/lib/cep.js';
import { cacheKey, toEndereco } from '../src/services/cep.service.js';
import { PAYLOAD_CURITIBA } from './helpers/fake-viacep.js';

describe('sanitizeCep', () => {
  test('remove máscara e espaços', () => {
    assert.equal(sanitizeCep('80010-010'), '80010010');
    assert.equal(sanitizeCep(' 80010 010 '), '80010010');
    assert.equal(sanitizeCep('80.010-010'), '80010010');
  });

  test('não quebra com null, undefined ou número', () => {
    assert.equal(sanitizeCep(null), '');
    assert.equal(sanitizeCep(undefined), '');
    assert.equal(sanitizeCep(80010010), '80010010');
  });
});

describe('isValidCep', () => {
  test('aceita exatamente 8 dígitos', () => {
    assert.equal(isValidCep('80010010'), true);
    assert.equal(isValidCep('00000000'), true);
  });

  test('rejeita tamanho errado ou não-dígito', () => {
    for (const invalido of ['1234567', '123456789', '', 'abcdefgh', '8001001a']) {
      assert.equal(isValidCep(invalido), false, `deveria rejeitar ${JSON.stringify(invalido)}`);
    }
  });
});

describe('formatCep', () => {
  test('insere o hífen na posição certa', () => {
    assert.equal(formatCep('80010010'), '80010-010');
  });
});

describe('cacheKey', () => {
  test('prefixa o CEP sanitizado', () => {
    assert.equal(cacheKey('80010010'), 'cep:80010010');
  });
});

describe('toEndereco', () => {
  test('traduz o payload do ViaCEP para o nosso contrato', () => {
    const endereco = toEndereco(PAYLOAD_CURITIBA);

    assert.equal(endereco.cep, '80010010');
    assert.equal(endereco.cepFormatado, '80010-010');
    assert.equal(endereco.cidade, 'Curitiba', 'localidade vira cidade');
    assert.equal(endereco.uf, 'PR');
  });

  test('campos vazios viram null, não string vazia', () => {
    const endereco = toEndereco({ ...PAYLOAD_CURITIBA, complemento: '', bairro: '   ' });

    assert.equal(endereco.complemento, null);
    assert.equal(endereco.bairro, null);
  });

  test('não expõe campos internos dos Correios', () => {
    const endereco = toEndereco(PAYLOAD_CURITIBA);

    for (const interno of ['gia', 'siafi', 'unidade', 'localidade']) {
      assert.equal(interno in endereco, false, `${interno} não deveria vazar`);
    }
  });
});
