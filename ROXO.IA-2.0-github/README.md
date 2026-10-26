# roxo.ia 2.0 — Terminal de Análise Probabilística & IA

Aplicação web para estudar **opções binárias, forex e criptoativos** com indicadores técnicos, backtest verificável, gestão de banca e apoio de IA. O foco desta versão é **honestidade**: o sistema mostra de onde vêm os dados, quando a IA não está configurada e quais números são estimativas.

> **Aviso importante**
> Este software é uma ferramenta de estudo e análise estatística. Ele **não é recomendação de investimento**, não garante resultados e **não deve custodiar dinheiro real**. Opções binárias são produtos de alto risco. Use apenas capital que você pode perder e respeite a legislação do seu país.

---

## 1. O que você precisa

- **Node.js 20.19 ou superior** (recomendado Node 22+). Download: <https://nodejs.org>
- **npm** (instalado junto com o Node.js)
- Um navegador atualizado (Chrome, Edge, Firefox ou Safari)
- Opcional: chave gratuita do **Google Gemini** para respostas de IA
- Opcional: **MetaTrader 5** instalado para usar a ponte local de velas reais

Para conferir se o Node está instalado, abra o terminal e digite:

```bash
node -v
npm -v
```

Se aparecerem números de versão, está pronto.

---

## 2. Rodar no seu computador (passo a passo)

1. Abra a pasta do projeto no **Qoder** ou no terminal.
2. Instale as dependências (só precisa fazer uma vez):

   ```bash
   npm install
   ```

3. (Opcional) Crie o arquivo de configuração:

   - **Windows (Prompt de Comando):** `copy .env.example .env`
   - **Windows (PowerShell):** `Copy-Item .env.example .env`
   - **Git Bash / Linux / Mac:** `cp .env.example .env`

   Depois abra o `.env` e cole sua chave em `GEMINI_API_KEY`. Se não tiver chave, deixe vazio: a interface avisará que está usando o motor estatístico local.

4. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

5. Abra no navegador: **<http://localhost:3000>**

Para parar o servidor, pressione `Ctrl + C` no terminal.

### Se a porta 3000 estiver ocupada

Use outra porta:

```bash
PORT=3100 npm run dev
```

No Windows Prompt de Comando, use `set PORT=3100 && npm run dev`. No PowerShell, use `$env:PORT=3100; npm run dev`.

---

## 3. Comandos disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor local com recarregamento automático da interface |
| `npm run build` | Gera a versão de produção na pasta `dist/` |
| `npm start` | Sobe o servidor; com `NODE_ENV=production`, serve a pasta `dist/` |
| `npm test` | Executa os 29 testes automatizados dos motores de cálculo |
| `npm run lint` | Verifica erros de TypeScript sem gerar arquivos (`tsc --noEmit`) |
| `npm run preview` | Pré-visualiza a build do Vite |
| `npm run clean` | Remove `dist/` e `server.js` (não apaga seus dados do navegador) |

---

## 4. Acesso inicial e segurança

Ao abrir o site, clique em **Entrar / Cadastrar**.

- **Conta de administrador criada automaticamente:**
  - E-mail: `admin@roxo.ia`
  - Senha inicial: `admin123456`
- **Troque essa senha imediatamente** na aba **Painel Admin → Alterar senha**.
- Contas novas podem ser criadas pelo botão **Cadastrar**.
- As contas de demonstração antigas (`trader.pro@gmail.com` e `lucas.forex@hotmail.com`) **não têm senha cadastrada** e, por segurança, não conseguem mais entrar. Crie uma conta nova.

### O que a autenticação realmente é

- Login **local no seu navegador** (localStorage), com hash SHA-256 e salt fixo.
- **Não existe servidor de autenticação nem sincronização em nuvem.**
- Limpar os dados do navegador apaga contas, sessões, setups, diário e métricas locais.
- Não use senhas que você usa em outros sites.
- Para uso multiusuário real, é necessário implementar autenticação de servidor (não incluída nesta versão).

---

## 5. De onde vêm as velas (dados de mercado)

A ordem de tentativa do **navegador** é:

1. Ponte local MT5 (se a URL estiver configurada na aba Conexão)
2. Twelve Data (se você salvou uma chave própria)
3. Proxy do servidor → **Yahoo Finance**
4. **Binance** (para criptoativos)
5. Se tudo falhar: o app mostra **“Feed Indisponível”** e **não inventa velas**

No **servidor**, a ordem é:

1. Velas enviadas pela ponte MT5 nos últimos 30 minutos (mínimo de 5 velas)
2. Yahoo Finance

Observações:

- A ponte MT5 é um script local que você executa no seu computador; o código de exemplo está na aba **Conexão**.
- O endpoint `POST /api/market/mt5-ingest` existe **somente no servidor local** (Express). Na Vercel, use Twelve Data, Yahoo Finance ou Binance.
- Se `MT5_INGEST_TOKEN` estiver definido no `.env`, o endpoint de ingestão exige o cabeçalho `x-mt5-token`.
- Volume ausente é registrado como `0`, nunca como um valor inventado.
- **H4:** a Yahoo não oferece H4 nativo; o servidor agrupa 4 velas de 1 hora em buckets UTC de 4 horas. Twelve Data, Binance e MT5 fornecem H4 nativo.
- O endpoint de velas do servidor mantém cache curto (15 s) para reduzir chamadas ao provedor.

---

## 6. IA (Gemini 3.6 Flash)

- Modelo usado: **`gemini-3.6-flash`**.
- A chave pode ser configurada de duas formas:
  - No servidor, em `GEMINI_API_KEY` (recomendado para uso publicado)
  - No navegador, na aba **Conexão** (fica salva no localStorage deste dispositivo)
- **Sem chave**, o sistema usa o **Motor Estatístico Local** e informa isso claramente (`fallbackMode: true`). As respostas locais são cálculo determinístico, não IA.
- Limites e proteções do servidor: 30 requisições de IA por minuto por IP, timeout de 25 s, validação de campos e limite de tamanho da imagem.
- **Limitação de segurança:** quando a chave é usada diretamente no navegador, a chamada ao Google inclui a chave na URL. Evite usar chave pessoal em computadores compartilhados. Para produção, prefira a chave no servidor.

### OCR de gráficos (foto/print)

- Formatos aceitos: **PNG, JPEG/JPG e WebP**.
- Limite: **8.000.000 de caracteres em base64** (aprox. 6 MB de imagem).
- A imagem precisa ter eixos legíveis. O resultado só é aceito com `isValidChart = true` e confiança **≥ 70**.
- Quando validado, o app tenta buscar as velas reais do símbolo/timeframe detectado; se o feed não responder, ele avisa em vez de gerar dados sintéticos.
- A imagem é enviada para análise e não é gravada pelo aplicativo.

---

## 7. Backtest: como os números são calculados

O backtest de opções binárias segue regras explícitas, sem olhar o futuro:

1. O sinal é avaliado no **fechamento da vela `i`**.
2. A entrada ocorre na **abertura da vela `i+1`**.
3. A saída ocorre no **fechamento da vela `i + expiração`** (1, 2 ou 3 velas).
4. Não há sobreposição de operações: a próxima entrada só acontece depois da expiração anterior.
5. Velas com preços inválidos são ignoradas.

Métricas exibidas:

- **Win Rate** = vitórias ÷ (vitórias + derrotas). Empates não entram no denominador.
- **Break-even** = `100 ÷ (100 + payout)` quando empates são devolvidos.
- Se o empate for tratado como perda, o break-even é ajustado pela taxa de empates.
- **Edge matemático** = Win Rate − Break-even.
- **Expectância por operação** = média exata do lucro/prejuízo de todas as operações.
- **Profit Factor** = lucro bruto ÷ prejuízo bruto; aparece como `∞` quando há lucro e nenhuma perda.
- **Drawdown** máximo em valor e em percentual.
- **Sequências** máxima de vitórias e de derrotas.
- **Intervalo de confiança de Wilson 95%** para o Win Rate.
- **“Sharpe” por operação**: média ÷ desvio-padrão dos retornos por operação. **Não é anualizado** e não é garantia de resultado futuro.

O CSV do backtest é exportado pela própria aba **Backtest Pro**.

---

## 8. Indicadores e regras

Indicadores implementados em `src/services/indicators.ts`:

- SMA e EMA (EMA semeada pela SMA; sem valores antes de haver histórico)
- RSI de Wilder
- MACD (linha, sinal e histograma — histograma começa após o sinal existir)
- Bandas de Bollinger (desvio-padrão populacional)
- ATR de Wilder
- ADX clássico de Wilder (retorna `null` até haver histórico suficiente)
- Estocástico com janela completa
- Suportes e resistências por pivôs
- Pullback em EMA, rompimento/falso rompimento (trap) e divergência de RSI
- Padrões de vela (doji, martelo, estrela cadente, engolfos, pin bar etc.)

Regras desconhecidas ou inválidas **bloqueiam o sinal** em vez de gerar pontuação aleatória.

---

## 9. Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl + K` ou `⌘ + K` | Abrir/fechar a paleta de comandos |
| `?` | Abrir o painel de atalhos |
| `Esc` | Fechar painel, paleta ou janela aberta |
| `Alt + 1…8` | Trocar de aba (Terminal, Setups, Backtest, Gestão, Filtros, IA & Diário, Conexão, Admin) |
| `Enter` | No campo de ativo, carregar as velas do símbolo digitado |

Atalhos de letra não funcionam enquanto você digita em campos de texto.

---

## 10. Estrutura do projeto

```
.
├── api/                     Funções serverless para Vercel
│   ├── _lib.ts              Modelo Gemini, timeout, rate limit
│   ├── _market.ts           Yahoo Finance, validação de símbolo/timeframe
│   ├── admin/metrics.ts     Saúde honesta do servidor
│   ├── gemini/              analyze, report e vision
│   └── market/candles.ts    Proxy de velas
├── public/                  Arquivos estáticos e pacote para download
├── src/
│   ├── components/          Telas e modais
│   ├── services/            Motores de cálculo, dados, IA e persistência
│   ├── types.ts             Tipos compartilhados
│   ├── App.tsx              Navegação e estado principal
│   └── main.tsx             Entrada do React
├── tests/engines.test.ts    Testes automatizados (node:test)
├── server.ts                Servidor Express + Vite em desenvolvimento
├── vercel.json              Configuração de deploy e cabeçalhos
└── GUIA_VERCEL_GITHUB.md    Publicação para iniciantes
```

---

## 11. Publicação (Vercel)

O passo a passo para iniciantes está em [`GUIA_VERCEL_GITHUB.md`](./GUIA_VERCEL_GITHUB.md). Resumo:

1. Envie o projeto para um repositório no GitHub.
2. Importe o repositório na Vercel (framework **Vite**).
3. Configure `GEMINI_API_KEY` em **Environment Variables** (opcional).
4. Faça o deploy.

**Antes de publicar:** troque a senha do administrador, revise as limitações de autenticação local e nunca suba o arquivo `.env`.

---

## 12. Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `EADDRINUSE` | Já existe um servidor usando a porta | Feche o processo antigo ou use `PORT=3100 npm run dev` |
| “Feed Indisponível” | Provedores externos fora do ar ou bloqueados | Tente outro ativo, aguarde ou configure a ponte MT5/Twelve Data |
| IA responde “Motor Estatístico Local” | Nenhuma chave Gemini configurada | Preencha `GEMINI_API_KEY` no `.env` e reinicie o servidor |
| Login antigo não funciona | Contas de demonstração não têm senha | Crie uma conta nova |
| Dados desapareceram | Limpeza do navegador ou outro navegador/perfil | Use o **Backup Dados JSON** antes; não há restauração automática |
| Gráfico recusado no OCR | Imagem ilegível ou confiança < 70 | Envie print nítido, com eixos e preço visíveis |

### Backup de dados

Na aba **Conexão** existe o botão **Backup Dados JSON**. Ele exporta setups, filtros, gestão e chaves de API em texto puro. **Guarde esse arquivo com cuidado**, pois ele contém segredos. Não existe botão de restauração automática nesta versão.

---

## 13. Testes e verificação

```bash
npm run lint   # tipos
npm test       # 29 testes dos motores
npm run build  # build de produção
```

Os testes cobrem: entrada na abertura seguinte, saída na expiração, ausência de sobreposição, empate devolvido/perdido, stake percentual, banca zerada, vela inválida, regra desconhecida bloqueada, aquecimento dos indicadores, filtros, suporte/resistência e intervalo de Wilson.

---

## 14. Limitações conhecidas desta versão

- Autenticação apenas local, sem servidor e sem nuvem.
- Contas de demonstração antigas sem senha não entram mais.
- O backup JSON não possui restauração pela interface.
- A chave usada no navegador fica no localStorage e pode aparecer na URL da chamada direta ao Gemini.
- O “Sharpe” é uma estimativa por operação, não anualizada.
- O sistema não executa ordens em corretoras; ele apenas analisa dados.
- Não há garantia de lucro. Resultados passados não garantem resultados futuros.

Consulte também [`CHANGELOG.md`](./CHANGELOG.md) e [`docs/REFERENCIA_TECNICA.md`](./docs/REFERENCIA_TECNICA.md).
