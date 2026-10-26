# Changelog — roxo.ia

Todas as mudanças relevantes do projeto. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [2.0.1] — 2026-10-26

### Corrigido

- **Modelo Gemini escolhido por teste real:** com a chave configurada, `gemini-2.5-flash` retornou 404 informando que não está mais disponível para novas contas e recomendando `gemini-3.8-flash`. O 3.8 respondeu 503 (alta demanda) em todas as tentativas; `gemini-3.6-flash` e `gemini-3.5-flash` responderam 200. O padrão passou a ser **`gemini-3.6-flash`** no servidor, nas funções Vercel, no cliente e no teste de conexão da interface.
- **Validação ponta a ponta:** `POST /api/gemini/analyze` retornou `aiPowered: true`, `modelUsed: "gemini-3.6-flash"` e parecer real em aproximadamente 8,7 s.
- **Documentação:** README e referência técnica atualizados para o modelo 3.6 Flash.

## [2.0.0] — 2026-10-26

Revisão de auditoria, correção e finalização. Nenhum recurso foi removido sem registro; as mudanças abaixo priorizam **honestidade dos dados, correção matemática e segurança básica**.

### Corrigido

- **Modelo de IA:** `gemini-3.8-flash` foi substituído por `gemini-2.5-flash` no servidor, nas funções Vercel e no cliente. Este ajuste foi revertido no teste real com chave — ver **2.0.1**.
- **Backtest de opções binárias:**
  - entrada agora ocorre na **abertura da vela seguinte** ao sinal (sem lookahead);
  - saída no **fechamento da vela de expiração** (1, 2 ou 3 velas);
  - operações não se sobrepõem;
  - empates podem ser devolvidos ou contabilizados como perda, com break-even ajustado;
  - Profit Factor retorna `Infinity` quando não há perdas;
  - expectância por operação calculada sobre todas as operações;
  - “Sharpe” por operação, sem anualização indevida;
  - velas com preços inválidos são ignoradas;
  - banca zerada encerra o backtest.
- **Indicadores:**
  - EMA semeada pela SMA e sem valores antes do histórico;
  - ADX clássico de Wilder, com aquecimento correto;
  - Estocástico exigindo janela completa;
  - MACD com histograma apenas após o sinal existir;
  - RSI de Wilder e Bollinger com desvio populacional.
- **Parâmetros com valor zero:** regras de RSI/ADX/ATR não substituem mais um `0` explícito pelo valor padrão.
- **Mensagens falsas na interface:**
  - testes de provedores (Twelve Data, Finnhub, Alpha Vantage, Polygon) agora fazem chamadas reais com timeout e não afirmam validação quando não houve;
  - teste de webhook não afirma que o destino recebeu o evento;
  - textos de “nuvem” substituídos por armazenamento local;
  - botão que preenchia automaticamente o login do dono foi removido;
  - login não cria mais contas automaticamente e rejeita contas antigas sem senha;
  - OCR não inventa confiança quando nenhuma leitura foi feita (agora `0`);
  - fallback de relatório não afirma “disciplina mantida” sem dados;
  - filtro de ruído não aparece mais como “Aprovado” quando não foi informado;
  - metadados do site não prometem mais sincronização em nuvem.
- **Dados de mercado:**
  - volume ausente na Twelve Data não vira mais `1000`;
  - timeframe H4 deixou de rotular velas de 1h como 4h: o servidor agora agrega 4 velas horárias em buckets UTC de 4h, e o `providerName` indica a agregação;
  - Twelve Data passou a mapear corretamente `30m`, `4h` e `1d`; a ponte MT5 de exemplo ganhou `TIMEFRAME_H4`;
  - pares cripto como `BTCUSDT` deixaram de ser classificados como forex só por conterem “USD”, eliminando uma chamada 503 desnecessária antes da Binance;
  - servidor só usa a ponte MT5 com pelo menos 5 velas;
  - feed indisponível mostra “Feed Indisponível” em vez de velas sintéticas.
- **Datas/roteamento:** rota `/api` inexistente retorna 404 em JSON.

### Adicionado

- **Atalhos de teclado:** paleta de comandos (`Ctrl/⌘ + K`), painel de atalhos (`?`), fechamento com `Esc` e troca de aba com `Alt + 1…8`.
- **Componentes:** `CommandPaletteModal` e `ShortcutsModal`.
- **Testes automatizados:** 29 testes em `tests/engines.test.ts`, executados com `npm test`.
- **Proteções no servidor:**
  - rate limit de 30 req/min por IP nas rotas de IA;
  - timeout de 25 s no Gemini e 6 s no Yahoo;
  - validação de método, tipos, faixas e tamanhos;
  - limite de 8 milhões de caracteres para imagens;
  - cabeçalhos de segurança;
  - erros internos sem stack trace para o cliente.
- **Funções Vercel alinhadas:** `api/gemini/vision.ts`, `api/admin/metrics.ts`, `api/_lib.ts` e `api/_market.ts`.
- **Métricas honestas do Admin:** uptime, runtime, chave de IA configurada, feed e status real da ponte MT5; contagem de usuários explicitamente local.
- **Documentação:** `README.md`, `docs/REFERENCIA_TECNICA.md`, este changelog e atualização do guia de publicação.
- **Pacote para download** em `public/roxo-ia-completo.zip`.

### Alterado

- Nome da aba “Setups & Nuvem” para **“Setups & Regras”**.
- Textos de backup, conexão e câmera para refletir o comportamento real.
- `vercel.json` com duração máxima de 60 s para funções e cabeçalhos de segurança.
- `package.json` com script `test`.

### Segurança / limitações documentadas

- A autenticação continua **local** (localStorage, SHA-256 com salt fixo), sem servidor.
- Contas de demonstração antigas sem senha não conseguem mais entrar.
- O backup JSON exporta chaves de API em texto puro e não tem restauração pela interface.
- A chave Gemini usada no navegador fica no localStorage; no fallback direto, aparece na URL.
- Não há execução de ordens em corretoras nem custódia de dinheiro real.

### Testes executados nesta versão

- `npm test` — 29 testes, todos aprovados.
- `npx tsc --noEmit` — sem erros de tipo.
- `npm run build` — build de produção concluída.
- Verificação manual dos endpoints locais (`/api/admin/metrics`, `/api/market/mt5-ingest`, `/api/market/candles`, `/api/gemini/vision`, `/api/gemini/analyze`, `/api/gemini/report` e rota 404).
- Teste de fumaça na interface (navegador via CDP): carregamento do Terminal com dados reais da Binance, console sem erros, paleta de comandos, painel de atalhos, troca de abas, restrição do Admin para visitante, modal de login com aviso local e execução de backtest real (8 operações).
- Agregação H4 verificada com dados reais da Yahoo: intervalos de 4h e OHLC consistente (gaps maiores correspondem ao fim de semana).

Consulte o relatório final da auditoria para o detalhamento dos resultados e do que não foi testado.
