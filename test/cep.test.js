import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { formatCep, isValidCep, sanitizeCep } from '../src/lib/cep.js';
import { cacheKey, toEndereco } from '../src/services/cep.service.js';
import { PAYLOAD_CURITIBA, PAYLOAD_PUC } from './helpers/fake-viacep.js';

// ... sanitizeCep, isValidCep, formatCep e cacheKey seguem como estão ...

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

  test('CEP de grande usuário preserva o logradouro com número', () => {
    const endereco = toEndereco(PAYLOAD_PUC);

    assert.equal(endereco.cep, '80215901');
    assert.equal(endereco.cepFormatado, '80215-901');
    assert.equal(endereco.logradouro, 'Rua Imaculada Conceição 1155');
    assert.equal(endereco.bairro, 'Prado Velho');
    assert.equal(endereco.cidade, 'Curitiba');
    assert.equal(endereco.complemento, null);
  });

  test('não expõe campos internos dos Correios', () => {
    for (const payload of [PAYLOAD_CURITIBA, PAYLOAD_PUC]) {
      const endereco = toEndereco(payload);

      for (const interno of ['gia', 'siafi', 'unidade', 'localidade']) {
        assert.equal(interno in endereco, false, `${interno} não deveria vazar de ${payload.cep}`);
      }
    }
  });
});