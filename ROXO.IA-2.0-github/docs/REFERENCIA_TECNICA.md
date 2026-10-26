# Referência Técnica — roxo.ia 2.0

Documento para quem precisa entender, manter ou auditar o projeto. Para instalar e usar, comece pelo [`README.md`](../README.md).

---

## 1. Arquitetura

```
Navegador (React 19 + TypeScript + Vite + Tailwind 4)
   │
   ├── localStorage .......... contas, sessão, setups, filtros, gestão, diário, chaves
   │
   ├── /api/market/... ....... servidor local (Express) ou função Vercel
   ├── /api/gemini/... ....... servidor local (Express) ou função Vercel
   └── /api/admin/metrics .... saúde honesta do processo

Servidor
   ├── MT5 ingest (memória) ... velas enviadas pela ponte local
   ├── Yahoo Finance ......... proxy de velas
   ├── Gemini 3.6 Flash ...... analyze, report e vision
   └── Vite ................... desenvolvimento; em produção serve dist/
```

O mesmo contrato de API existe em duas implementações para velas, IA e métricas:

- `server.ts` — servidor Express usado em desenvolvimento e em hospedagem própria.
- `api/**` — funções serverless usadas na Vercel.

Exceção: `POST /api/market/mt5-ingest` existe **apenas no servidor Express**. Funções serverless não compartilham memória entre chamadas, então a ponte MT5 não funciona na Vercel; nesse ambiente use Twelve Data, Yahoo Finance ou Binance. As regras de validação, modelo de IA e formato de resposta dos demais endpoints devem ser mantidos em paridade.

---

## 2. Variáveis de ambiente

| Variável | Obrigatória | Efeito |
|---|---|---|
| `GEMINI_API_KEY` | Não | Ativa o Gemini 3.6 Flash no servidor. Sem ela, a IA cai no motor estatístico local |
| `MT5_INGEST_TOKEN` | Não | Quando definida, exige o cabeçalho `x-mt5-token` no `POST /api/market/mt5-ingest` |
| `PORT` | Não | Porta do servidor Express (padrão `3000`) |
| `NODE_ENV` | Não | `production` serve `dist/`; qualquer outro valor usa o Vite em modo middleware |

O arquivo `.env` nunca deve ser versionado. O `.gitignore` já o exclui.

---

## 3. Endpoints

### `POST /api/market/mt5-ingest` (somente servidor Express)

Recebe velas da ponte local do MetaTrader 5. Este endpoint **não existe na Vercel**, porque o armazenamento é em memória do processo.

Cabeçalho opcional: `x-mt5-token: <MT5_INGEST_TOKEN>`.

Corpo:

```json
{
  "symbol": "EURUSD",
  "timeframe": "5m",
  "candles": [
    { "t": 1700000000000, "o": 1.1, "h": 1.11, "l": 1.09, "c": 1.105, "v": 100 }
  ]
}
```

Regras:

- `symbol`: 2 a 20 caracteres (`A-Z`, `a-z`, `0-9`, ponto ou hífen).
- `timeframe`: `1m`, `5m`, `15m`, `30m`, `1h`, `4h` ou `1d`.
- `candles`: array com **5 a 5000** velas.
- Cada vela exige `t`, `o`, `h`, `l`, `c` e `v` numéricos; `o` e `c` positivos; `h >= l`.
- Volume ausente vira `0`; não é inventado.
- O armazenamento é **em memória**, com no máximo 200 símbolos/timeframes; o mais antigo é descartado.
- A entrada é considerada válida por **30 minutos** no momento da consulta.

Respostas: `200` com `{ success, count, receivedAt }`, `400` para payload inválido, `403` para token incorreto.

### `GET /api/market/candles`

Parâmetros: `symbol`, `timeframe`, `limit` (20 a 500; padrão 160).

Usa Yahoo Finance. Símbolos de forex de 6 letras recebem o sufixo `=X`. Retorna:

```json
{
  "symbol": "EURUSD",
  "timeframe": "5m",
  "count": 160,
  "source": "yahoo",
  "providerName": "Yahoo Finance Live v8",
  "isReal": true,
  "candles": [{ "t": 0, "o": 1, "h": 1, "l": 1, "c": 1, "v": 0 }]
}
```

- Cache: `Cache-Control: public, max-age=15`.
- CORS: `*` para GET/OPTIONS.
- Em falha do provedor: `503` com `candles: []` e `isReal: false`.
- Mínimo de 5 velas válidas; caso contrário, erro.
- **H4:** a Yahoo não tem H4 nativo. O servidor busca 1h e agrupa 4 velas em buckets UTC de 4h (`o` da primeira, máxima, mínima, `c` da última, volume somado). O `providerName` informa que houve agregação.

### `POST /api/gemini/analyze`

Corpo mínimo:

```json
{
  "symbol": "EURUSD",
  "timeframe": "5m",
  "probability": 63.4,
  "payout": 85,
  "score": 72,
  "ev": 3.1,
  "setupName": "Retração M5",
  "rulesStatus": "RSI ok",
  "role": "analista"
}
```

- `symbol` e `timeframe` obrigatórios.
- `probability` e `payout` numéricos.
- `role` ∈ `analista`, `professor`, `auditor`, `explicador`, `setup`, `revisor`.
- Chave por requisição: cabeçalho `x-gemini-key` ou campo `apiKey`.
- Sem chave: resposta `200` com `fallbackMode: true`, `modelUsed: "Motor Estatístico Local"` e `aiPowered: false`.
- Textos e JSON de indicadores são truncados no servidor.

### `POST /api/gemini/report`

Corpo: `{ bankroll, totalOps, winRate, profitLoss, sessionData? }`, todos numéricos (exceto `sessionData`, limitado a 20 itens).

Sem chave, devolve um relatório local claramente identificado. Os pontos fortes e melhorias são derivados dos números informados; quando `totalOps <= 0`, a resposta declara que não há desempenho a avaliar.

### `POST /api/gemini/vision`

Corpo: `{ imageBase64, mimeType }`.

- MIME aceito: `image/png`, `image/jpeg`, `image/jpg`, `image/webp`.
- Limite: 8.000.000 de caracteres em base64.
- Sem imagem: `400`. MIME inválido: `415`. Imagem grande: `413`.
- O modelo responde em JSON. O servidor só aceita `isValidChart = true` com `confidence >= 70`.
- Em caso de sucesso, tenta buscar velas reais na Yahoo Finance para o símbolo/timeframe detectado.
- Se o feed falhar, retorna `isValidChart: true` com `candles: []` e um aviso — **não gera velas sintéticas**.

### `GET /api/admin/metrics`

Retorna apenas dados verificáveis do processo:

```json
{
  "online": true,
  "uptimeSec": 28,
  "runtime": "Node v24.22.1",
  "aiKeyConfigured": false,
  "marketFeed": "Yahoo Finance (proxy do servidor)",
  "mt5BridgeActive": true,
  "serverTime": "2026-10-26T16:59:43.255Z"
}
```

Contagem de usuários, setups e diário é **local do navegador** e não é enviada ao servidor.

### Rotas inválidas

Qualquer `/api/*` não reconhecida retorna `404` com `{ "error": "Rota de API não encontrada." }` em JSON. Erros de payload retornam `413` (grande demais), `400` (JSON inválido) ou `500` (erro interno), sem vazar stack trace.

---

## 4. Segurança implementada

- Cabeçalhos `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
- Rate limit de IA: **30 requisições por minuto por IP**, em memória (reinicia junto com o processo).
- Timeouts: Gemini 25 s; Yahoo 6 s; MT5 local 2 s no cliente.
- Validação de método HTTP, tipos, faixas e tamanhos em todas as rotas de IA e mercado.
- Nenhuma vela sintética é gerada quando o feed falha.
- Erros internos não são enviados ao cliente.

### Limitações de segurança que permanecem

1. A autenticação é **local** (localStorage), com SHA-256 e salt fixo. Não há autorização no servidor.
2. Chaves de API salvas no navegador ficam em localStorage e podem ser lidas por scripts na mesma origem.
3. O fallback direto para o Gemini no navegador coloca a chave na URL da requisição.
4. O rate limit em memória não é compartilhado entre instâncias serverless.
5. O backup JSON inclui chaves de API em texto puro.
6. Não há proteção CSRF dedicada nas rotas de IA; elas são stateless e não alteram dados do servidor.

Para uso público com dinheiro real, seria necessário autenticação de servidor, banco de dados, autorização por papel, cofre de segredos e auditoria — itens **fora do escopo** desta versão.

---

## 5. Persistência local (localStorage)

| Chave | Conteúdo |
|---|---|
| `roxoia_users` | Lista de contas locais |
| `roxoia_admin_vault` | Hash da senha do administrador |
| `roxoia_session` | Sessão atual (expira em 7 dias) |
| `roxoia_cloud_setups` | Setups salvos neste navegador |
| `roxoia_filters` | Filtros anti-ruído |
| `roxoia_mgmt` | Configuração de gestão de banca |
| `roxoia_trades` | Diário de operações |
| `roxoia_api_keys` | Chaves de provedores de mercado |
| `roxoia_gemini_api_key` | Chave Gemini inserida na interface |
| `roxoia_mt5_bridge_url` | URL da ponte local MT5 |

Limpar os dados do navegador apaga tudo. O botão **Backup Dados JSON** exporta parte desses dados, mas não há restauração automática na interface.

---

## 6. Motores de cálculo

### `src/services/indicators.ts`

Todos os indicadores evitam valores antes de existir histórico suficiente. Isso é verificado pelos testes: SMA, EMA, RSI, ADX, Estocástico, MACD, Bollinger e ATR retornam `null` no aquecimento.

### `src/services/probabilityEngine.ts`

- Cada regra tem peso; regras satisfeitas somam, violadas subtraem.
- O score é normalizado em 0–100.
- A probabilidade usa uma transformação logística calibrada e, quando há backtest com `n >= 15`, é misturada com o histórico (peso máximo de 0,65).
- Regra desconhecida ou inválida zera a vantagem e limita o score a 42; o sinal é bloqueado.
- Calcula break-even, edge, esperança matemática e intervalo de Wilson.

### `src/services/backtestEngine.ts`

- Sinal no fechamento de `i`; entrada na abertura de `i+1`; saída no fechamento de `i + expiração`.
- Sem sobreposição de operações.
- Stake percentual (0,5% a 50%) ou fixo.
- Empate devolvido (`refund`) ou contabilizado como perda (`loss`).
- Banca nunca fica negativa; o backtest para se a banca chegar a zero.
- Profit Factor `Infinity` quando não há perdas e há lucro.
- Sharpe por operação, sem anualização.

---

## 7. IA e OCR

- Modelo: `gemini-3.6-flash` (servidor e fallback direto).
- O nome antigo `gemini-3.6-flash` não existe e foi removido.
- O cliente tenta primeiro o endpoint do servidor; se indisponível e houver chave local, tenta o Google diretamente com timeout.
- O OCR não persiste a imagem.
- A validação de gráfico é conservadora: sem eixos legíveis ou confiança < 70, a imagem é recusada.

---

## 8. Testes automatizados

Arquivo: `tests/engines.test.ts` — executado com `npm test` (`tsx --test`).

Cobrem, entre outros:

- backtest com menos de 40 velas;
- entrada na abertura seguinte e saída na expiração;
- expiração de 3 velas sem sobreposição;
- operação PUT vencedora;
- empate devolvido e empate como perda;
- stake percentual e banca zerada;
- vela inválida ignorada;
- regra desconhecida bloqueada;
- histórico insuficiente em EMA/SMA e aquecimento dos indicadores;
- filtros anti-ruído;
- suporte/resistência sem dados;
- limites e aquecimento de SMA, EMA, RSI, ADX, Estocástico, MACD, Bollinger e ATR;
- intervalo de Wilson.

---

## 9. Como verificar a API manualmente

Com o servidor rodando em `http://localhost:3000`:

```bash
curl -s http://localhost:3000/api/admin/metrics

curl -s "http://localhost:3000/api/market/candles?symbol=EURUSD&timeframe=5m&limit=60"

curl -s -X POST http://localhost:3000/api/market/mt5-ingest \
  -H "Content-Type: application/json" \
  -d '{"symbol":"EURUSD","timeframe":"5m","candles":[{"t":1,"o":1.1,"h":1.11,"l":1.09,"c":1.105,"v":100}]}'
# esperado: HTTP 400 (menos de 5 velas)
```

Para o OCR, envie uma imagem pequena em base64. Formatos diferentes de PNG/JPEG/WebP devem retornar `415`.

---

## 10. Manutenção

- Ao alterar um endpoint, atualize **as duas implementações** (`server.ts` e `api/`).
- Ao adicionar uma regra, inclua o caso no `evaluateRule` e um teste.
- Ao mexer em indicadores, rode `npm test` e confira os testes de aquecimento.
- Ao alterar textos da interface, evite prometer nuvem, validação externa ou resultados que o código não entrega.
- Antes de publicar: `npm run lint`, `npm test`, `npm run build`.
