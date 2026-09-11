# Consulta CEP

API HTTP em Node.js que consulta o [ViaCEP](https://viacep.com.br) e devolve o
endereço em um formato próprio, normalizado, com cache em Redis.

## Requisitos

- Node.js 20.12 ou superior (usa `fetch`, `AbortSignal.timeout` e `process.loadEnvFile`)
- Redis (opcional — sem ele a API funciona, só consulta o ViaCEP toda vez)

## Como rodar

```bash
npm install
npm start        # produção
npm run dev      # com --watch
```

Subindo um Redis rápido:

```bash
docker run -d --name redis-cep -p 6379:6379 redis:7-alpine
```

Variáveis de ambiente (todas opcionais, ver `.env.example`):

| Variável            | Padrão                     | Descrição                             |
| ------------------- | -------------------------- | ------------------------------------- |
| `PORT`              | `3000`                     | Porta HTTP                            |
| `VIACEP_BASE_URL`   | `https://viacep.com.br/ws` | URL base do ViaCEP                    |
| `VIACEP_TIMEOUT_MS` | `5000`                     | Timeout da chamada ao ViaCEP          |
| `REDIS_URL`         | `redis://127.0.0.1:6379`   | Conexão com o Redis                   |
| `REDIS_ENABLED`     | `true`                     | `false` desliga o cache por completo  |
| `REDIS_KEY_PREFIX`  | `cep:`                     | Prefixo das chaves                    |
| `REDIS_TIMEOUT_MS`  | `1000`                     | Teto de espera por operação de cache  |
| `REDIS_TTL_SECONDS` | `86400`                    | Validade de cada CEP no cache (24h)   |
| `RATE_LIMIT_MAX`    | `60`                       | Requisições por IP na janela          |
| `RATE_LIMIT_WINDOW_MS` | `60000`                 | Tamanho da janela do rate limit       |
| `CORS_ORIGIN`       | `*`                        | Origens liberadas, separadas por vírgula |
| `TRUST_PROXY`       | —                          | Ligue só atrás de proxy (ex.: `1`)    |

## Cache

O CEP é consultado no Redis antes de ir ao ViaCEP. Em um HIT a API nem toca na
rede externa.

- **Chave:** `cep:80010010` — o CEP sanitizado, então `80010-010` e `80010010`
  caem na mesma entrada.
- **Valor:** o payload **cru** do ViaCEP, não o endereço já normalizado. Assim,
  se o contrato da nossa API mudar, `toEndereco` passa a valer também para o que
  já está cacheado, sem precisar limpar nada.
- **TTL de 24h:** endereço de CEP muda pouco, mas não nunca. Expirando em um
  dia, uma correção dos Correios entra sozinha no dia seguinte, sem depender de
  alguém lembrar de invalidar a chave. Ajustável por `REDIS_TTL_SECONDS`; `0`
  desliga a expiração e a entrada passa a viver até ser removida na mão.
- **Só sucesso é cacheado:** 404 (CEP inexistente) e erros do ViaCEP não entram
  no cache — CEPs novos são criados de tempos em tempos, e gravá-los como
  inexistentes para sempre seria irreversível na prática.

### O cache nunca derruba a API

O Redis é um acelerador, não uma dependência:

- se estiver fora, a request segue direto para o ViaCEP;
- toda operação de cache tem teto de `REDIS_TIMEOUT_MS`, então o cache não
  consegue adicionar latência indefinida à resposta;
- a reconexão é automática com backoff (até 5s), sem precisar reiniciar a API;
- a escrita no cache não bloqueia a resposta.

O header `X-Cache: HIT | MISS` em `GET /cep/:cep` mostra a origem dos dados, e o
`/health` reporta o estado da conexão.

## CORS e rate limit

**CORS** libera qualquer origem por padrão (`CORS_ORIGIN=*`), com os métodos
`GET` e `DELETE`. Para restringir:

```bash
CORS_ORIGIN=https://meusite.com,https://app.meusite.com
```

**Rate limit** de 60 requisições por IP por minuto, só em `/cep` — o `/health`
fica de fora, porque health check de orquestrador bate com frequência. A resposta
traz os headers do draft-7 do IETF:

```
RateLimit: limit=60, remaining=59, reset=60
RateLimit-Policy: 60;w=60
```

Estourando a cota, o 429 sai no mesmo formato dos outros erros da API, e não no
texto puro que a biblioteca manda por padrão:

```json
{ "error": { "code": "rate_limit_exceeded", "message": "Limite de 60 requisições a cada 60s excedido. Tente de novo em instantes." } }
```

> **Atrás de proxy:** sem `TRUST_PROXY`, o `req.ip` é o do proxy e todos os
> clientes dividem o mesmo balde — o limite estoura para todo mundo de uma vez.
> Ligue a variável só quando houver mesmo um proxy na frente; ligada sem proxy,
> qualquer um forja o `X-Forwarded-For` e escapa do limite.

## Estrutura

```
consulta-cep/
├── .env
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── test/                       # suíte com node:test
└── src/
    ├── server.js               # entrypoint: carrega env, sobe o servidor, trata shutdown
    ├── app.js                  # monta o Express (rotas + middlewares)
    ├── routes/
    │   └── cep.routes.js       # camada HTTP: recebe request, devolve response
    ├── services/
    │   ├── cep.service.js      # regra: valida, olha o cache, consulta e normaliza
    │   └── viacep.service.js   # integração com a API do ViaCEP
    └── lib/
        ├── AppError.js         # erro com status HTTP e código
        ├── cep.js              # sanitizar / validar / formatar CEP
        ├── env.js              # carrega o .env antes dos demais módulos
        ├── errorHandler.js     # middlewares de 404 e de erro
        ├── rateLimiter.js       # limite por IP, no formato de erro da API
        └── redis.js            # client do cache, tolerante a falha
```

A ideia da separação: `routes` só cuida de HTTP, `services` concentra a regra e a
integração externa, `lib` guarda o que é reaproveitável e sem estado.

## Endpoints

### `GET /cep/:cep`

Aceita CEP com ou sem máscara (`80010010` ou `80010-010`).

**200 OK** — header `X-Cache: HIT` ou `MISS`

```json
{
  "data": {
    "cep": "80010010",
    "cepFormatado": "80010-010",
    "logradouro": "Rua Marechal Deodoro",
    "complemento": "até 0766 - lado par",
    "bairro": "Centro",
    "cidade": "Curitiba",
    "estado": "Paraná",
    "uf": "PR",
    "regiao": "Sul",
    "ibge": "4106902",
    "ddd": "41"
  }
}
```

Campos vazios no ViaCEP viram `null` em vez de string vazia, `localidade` é
renomeado para `cidade` e os campos internos dos Correios (`gia`, `siafi`,
`unidade`) não são expostos.

### `DELETE /cep/:cep`

Invalida a entrada do cache — a forma de forçar uma releitura antes de o TTL de
24h expirar, quando você já sabe que o ViaCEP corrigiu o endereço.

```json
{ "data": { "cep": "80010010", "removido": true } }
```

`removido: false` significa que o CEP não estava cacheado (ou que o Redis está fora).

### `GET /health`

```json
{ "status": "ok", "uptime": 12.34, "redis": "ready" }
```

`redis` pode ser `ready`, `unavailable` ou `disabled`.

## Erros

Todo erro segue o mesmo formato:

```json
{ "error": { "code": "cep_not_found", "message": "CEP não encontrado." } }
```

| Status | `code`                 | Quando acontece                     |
| ------ | ---------------------- | ----------------------------------- |
| 400    | `invalid_cep`          | CEP não tem 8 dígitos               |
| 404    | `cep_not_found`        | CEP válido, mas inexistente         |
| 404    | `route_not_found`      | Rota inexistente                    |
| 429    | `rate_limit_exceeded`  | Excedeu o limite de requisições     |
| 502    | `upstream_unavailable` | Falha de rede ao chamar o ViaCEP    |
| 502    | `upstream_error`       | ViaCEP respondeu com status de erro |
| 504    | `upstream_timeout`     | ViaCEP não respondeu a tempo        |
| 500    | `internal_error`       | Qualquer erro não previsto          |

Falha no Redis nunca vira erro para o cliente.

## Testes

```bash
npm test          # roda a suíte
npm run test:watch
```

Usam o `node:test` embutido — nenhuma dependência de teste. Nada de rede real:
o ViaCEP e o Redis são substituídos por servidores fake em `test/helpers/`, que
falam o protocolo de verdade, então o código exercitado é o mesmo de produção.

| Arquivo                     | Cobre                                              |
| --------------------------- | -------------------------------------------------- |
| `cep.test.js`               | sanitizar / validar / formatar e o `toEndereco`     |
| `viacep.service.test.js`    | cada erro do upstream: 404, 400, 502, 504, JSON ruim |
| `cep.service.test.js`       | MISS → HIT, TTL de 24h, invalidação, payload cru    |
| `cache-offline.test.js`     | Redis fora: a API continua respondendo              |
| `app.test.js`               | CORS, rate limit e o contrato de erro HTTP          |

Os módulos leem `process.env` no topo, então os testes montam o ambiente e usam
`import()` dinâmico. Cada arquivo roda em processo próprio, o que permite a um
deles apontar para um Redis inexistente sem afetar os outros.

## Testando

```bash
curl -i http://localhost:3000/cep/80010-010   # 1a vez: X-Cache: MISS
curl -i http://localhost:3000/cep/80010-010   # 2a vez: X-Cache: HIT
curl -X DELETE http://localhost:3000/cep/80010-010
curl http://localhost:3000/cep/00000000       # 404
curl http://localhost:3000/cep/123            # 400
```
