import http from 'node:http';

/** Payload real do ViaCEP para 80010-010, usado como fixture. */
export const PAYLOAD_CURITIBA = {
  cep: '80010-010',
  logradouro: 'Rua Marechal Deodoro',
  complemento: 'até 0766 - lado par',
  unidade: '',
  bairro: 'Centro',
  localidade: 'Curitiba',
  uf: 'PR',
  estado: 'Paraná',
  regiao: 'Sul',
  ibge: '4106902',
  gia: '',
  ddd: '41',
  siafi: '7535',
};

/**
 * Sobe um ViaCEP falso numa porta efêmera. Cada CEP dispara um cenário:
 *
 * | CEP        | Resposta                          |
 * | ---------- | --------------------------------- |
 * | 80010010   | payload válido                    |
 * | 00000000   | `{ "erro": "true" }` (inexistente)|
 * | 11111111   | HTTP 400                          |
 * | 22222222   | HTTP 500                          |
 * | 33333333   | corpo que não é JSON              |
 * | 44444444   | nunca responde (força timeout)    |
 */
export async function startFakeViaCep() {
  let chamadas = 0;

  const server = http.createServer((req, res) => {
    chamadas += 1;
    const cep = req.url.split('/')[1] ?? '';

    if (cep === '44444444') return; // pendura a request de propósito

    if (cep === '11111111') {
      res.writeHead(400).end('');
      return;
    }

    if (cep === '22222222') {
      res.writeHead(500).end('');
      return;
    }

    if (cep === '33333333') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('isto nao e json');
      return;
    }

    const body = cep === '00000000' ? { erro: 'true' } : { ...PAYLOAD_CURITIBA, cep };
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    get chamadas() {
      return chamadas;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
