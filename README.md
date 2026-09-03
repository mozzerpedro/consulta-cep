# Consulta CEP

API HTTP em Node.js que consulta o [ViaCEP](https://viacep.com.br) e devolve o
endereço em um formato próprio, normalizado.

## Requisitos

- Node.js 18 ou superior (usa `fetch` e `AbortSignal.timeout` nativos)

## Como rodar

```bash
npm install
npm start        # produção
npm run dev      # com --watch
```

Variáveis de ambiente (todas opcionais, ver `.env`):

| Variável            | Padrão                     | Descrição                    |
| ------------------- | -------------------------- | ---------------------------- |
| `PORT`              | `3000`                     | Porta HTTP                   |
| `VIACEP_BASE_URL`   | `https://viacep.com.br/ws` | URL base do ViaCEP           |
| `VIACEP_TIMEOUT_MS` | `5000`                     | Timeout da chamada ao ViaCEP |

## Estrutura

```
consulta-cep/
├── .env
├── .gitignore
├── package.json
├── README.md
└── src/
    ├── server.js               # entrypoint: lê a porta e sobe o servidor
    ├── app.js                  # monta o Express (rotas + middlewares)
    ├── routes/
    │   └── cep.routes.js       # camada HTTP: recebe request, devolve response
    ├── services/
    │   ├── cep.service.js      # regra: valida, consulta e normaliza
    │   └── viacep.service.js   # integração com a API do ViaCEP
    └── lib/
        ├── AppError.js         # erro com status HTTP e código
        ├── cep.js              # sanitizar / validar / formatar CEP
        └── errorHandler.js     # middlewares de 404 e de erro
```

A ideia da separação: `routes` só cuida de HTTP, `services` concentra a regra e a
integração externa, `lib` guarda o que é reaproveitável e sem estado.

## Endpoints

### `GET /cep/:cep`

Aceita CEP com ou sem máscara (`80010010` ou `80010-010`).

**200 OK**

```json
{
  "data": {
    "cep": "80010010",
    "cepFormatado": "80010-010",
    "logradouro": "Praça Tiradentes",
    "complemento": null,
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

### `GET /health`

```json
{ "status": "ok", "uptime": 12.34 }
```

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
| 502    | `upstream_unavailable` | Falha de rede ao chamar o ViaCEP    |
| 502    | `upstream_error`       | ViaCEP respondeu com status de erro |
| 504    | `upstream_timeout`     | ViaCEP não respondeu a tempo        |
| 500    | `internal_error`       | Qualquer erro não previsto          |

## Testando

```bash
curl http://localhost:3000/cep/80010-010
curl http://localhost:3000/cep/00000000   # 404
curl http://localhost:3000/cep/123        # 400
```
