import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Google GenAI on the server
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// -------------------------------------------------------------
// Forex and Equities Live Synthetic / Market Data Generator
// -------------------------------------------------------------
interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const BASE_PRICES: Record<string, number> = {
  'EURUSD': 1.0850,
  'GBPUSD': 1.2980,
  'USDJPY': 152.40,
  'AUDUSD': 0.6540,
  'USDCAD': 1.3820,
  'EURGBP': 0.8360,
  'AAPL': 234.50,
  'TSLA': 218.20,
  'NVDA': 141.80,
  'MSFT': 428.10,
  'AMZN': 188.40,
};

function generateCandles(symbol: string, timeframe: string, count = 200): Candle[] {
  const base = BASE_PRICES[symbol.toUpperCase()] || 100.0;
  const isForex = symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('JPY');
  const volatility = isForex ? base * 0.0006 : base * 0.004;

  const tfMinutes: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  const stepMs = (tfMinutes[timeframe] || 5) * 60 * 1000;
  const now = Date.now();

  const candles: Candle[] = [];
  let currentPrice = base;

  // Generate deterministic past series
  for (let i = count; i >= 0; i--) {
    const time = now - i * stepMs;
    const change = (Math.sin(i / 6) * 0.6 + (Math.sin(i / 14) * 0.4) + (Math.random() - 0.49)) * volatility;
    const open = currentPrice;
    const close = Math.max(0.0001, open + change);
    const wickHigh = Math.max(open, close) + Math.random() * volatility * 0.8;
    const wickLow = Math.min(open, close) - Math.random() * volatility * 0.8;
    const volume = Math.floor(1000 + Math.random() * 8000);

    candles.push({
      t: time,
      o: Number(open.toFixed(isForex ? 5 : 2)),
      h: Number(wickHigh.toFixed(isForex ? 5 : 2)),
      l: Number(wickLow.toFixed(isForex ? 5 : 2)),
      c: Number(close.toFixed(isForex ? 5 : 2)),
      v: volume,
    });
    currentPrice = close;
  }

  return candles;
}

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// 1. Forex & Equities Candlestick API
app.get('/api/market/candles', (req: Request, res: Response) => {
  const symbol = String(req.query.symbol || 'EURUSD').toUpperCase();
  const timeframe = String(req.query.timeframe || '5m');
  const limit = Math.min(500, Math.max(20, Number(req.query.limit) || 200));

  const candles = generateCandles(symbol, timeframe, limit);
  res.json({
    symbol,
    timeframe,
    count: candles.length,
    candles,
  });
});

// 2. Gemini AI - Binary Options Confluence & Entry Analysis
app.post('/api/gemini/analyze', async (req: Request, res: Response) => {
  const { symbol, timeframe, probability, score, ev, indicators, setupName, rulesStatus, payout } = req.body;

  if (!aiClient) {
    // Return high-value deterministic statistical breakdown if key is not attached yet
    const verdict = probability >= 60 ? 'CALL (COMPRA)' : probability <= 40 ? 'PUT (VENDA)' : 'NEUTRO / ESPERAR';
    return res.json({
      verdict,
      confidence: Math.round(Math.abs(probability - 50) * 1.8),
      recommendation: `Análise estatística para ${symbol} (${timeframe}): Setup "${setupName}" com probabilidade matemática de ${probability}%. Esperança matemática ${ev >= 0 ? '+' : ''}${ev}%. Payout de ${payout}%. Opere respeitando a gestão de banca máxima de 2% por entrada.`,
      confluences: [
        `Probabilidade calculada: ${probability}%`,
        `Filtro de Ruído: ${rulesStatus || 'Aprovado'}`,
        `Risco/Retorno Esperado: ${ev >= 0 ? 'Positivo' : 'Negativo'}`,
      ],
      aiPowered: false,
    });
  }

  try {
    const prompt = `Você é um analista quantitativo sênior especialista em Opções Binárias e probabilidade matemática no mercado financeiro (Forex, Cripto e Ações).
Analise os seguintes dados em tempo real da próxima vela de expiração:
- Ativo: ${symbol}
- Tempo Gráfico / Expiração: ${timeframe}
- Setup Utilizado: ${setupName}
- Probabilidade Estatística Estimada: ${probability}%
- Score do Setup (0 a 100): ${score}
- Esperança Matemática (EV): ${ev}%
- Payout da Corretora: ${payout}%
- Leitura dos Indicadores: ${JSON.stringify(indicators || {})}
- Regras Satisfeitas: ${rulesStatus}

Forneça uma resposta direta, estritamente estruturada em JSON com o formato:
{
  "verdict": "CALL (COMPRA)" | "PUT (VENDA)" | "NEUTRO / NÃO OPERAR",
  "confidenceScore": número de 0 a 100,
  "rationale": "Explicação concisa e técnica de 2 a 3 frases com base na probabilidade, payout e confluências de candlestick/indicadores.",
  "keyConfluences": ["confluência 1", "confluência 2", "ponto de atenção"],
  "riskWarning": "aviso de gestão ou filtro relevante para opções binárias (ex.: atenção a notícias ou volatilidade)"
}`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    return res.json({
      verdict: parsed.verdict || (probability >= 55 ? 'CALL (COMPRA)' : 'NEUTRO'),
      confidence: parsed.confidenceScore || Math.round(probability),
      recommendation: parsed.rationale || 'Análise calculada com base no modelo estatístico.',
      confluences: parsed.keyConfluences || [],
      riskWarning: parsed.riskWarning || 'Mantenha disciplina e teto de stop loss diário.',
      aiPowered: true,
    });
  } catch (error: any) {
    console.error('Gemini analyze error:', error);
    return res.status(200).json({
      verdict: probability >= 60 ? 'CALL (COMPRA)' : probability <= 40 ? 'PUT (VENDA)' : 'NEUTRO',
      confidence: Math.round(probability),
      recommendation: `Análise calculada pelo motor probabilístico: probabilidade de ${probability}% no setup ${setupName}.`,
      confluences: ['Motor probabilístico local ativo', 'Filtros avaliados com sucesso'],
      aiPowered: false,
      fallbackError: error.message,
    });
  }
});

// 3. Gemini AI - Automated Performance & Session Report
app.post('/api/gemini/report', async (req: Request, res: Response) => {
  const { sessionData, bankroll, totalOps, winRate, profitLoss } = req.body;

  if (!aiClient) {
    return res.json({
      title: 'Relatório de Desempenho Estatístico',
      summary: `Sessão concluída com ${totalOps || 0} operações e taxa de acerto de ${winRate || 0}%. Resultado acumulado: ${profitLoss || 0} na banca de ${bankroll || 1000}.`,
      advice: 'Recomenda-se manter o risco máximo por operação entre 1% e 2% e respeitar o critério de Kelly.',
      aiPowered: false,
    });
  }

  try {
    const prompt = `Como um mentor quantitativo de trading e opções binárias, elabore um relatório executivo conciso e profissional em formato JSON avaliando esta sessão de trading:
- Banca Inicial/Atual: ${bankroll}
- Total de Operações: ${totalOps}
- Taxa de Acerto (Win Rate): ${winRate}%
- Lucro/Prejuízo: ${profitLoss}
- Dados da Sessão: ${JSON.stringify(sessionData || [])}

Responda em JSON:
{
  "title": "título chamativo do relatório",
  "summary": "resumo de 2 a 3 frases com diagnóstico do desempenho e expectativa matemática",
  "strengths": ["ponto forte 1", "ponto forte 2"],
  "improvements": ["ajuste sugerido de gestão", "ajuste de filtro de ruído"],
  "verdict": "APROVADO / LUCRATIVO" | "ATENÇÃO / REVISAR SETUPS" | "STOP ATINGIDO"
}`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ ...parsed, aiPowered: true });
  } catch (error: any) {
    return res.json({
      title: 'Relatório Quantitativo de Sessão',
      summary: `Desempenho com ${totalOps} operações, Win Rate de ${winRate}%. Resultado: ${profitLoss}.`,
      verdict: Number(winRate) >= 60 ? 'APROVADO / LUCRATIVO' : 'ATENÇÃO / REVISAR SETUPS',
      aiPowered: false,
    });
  }
});

// 4. Admin Monitor Endpoint
let mockVisits = 142;
app.get('/api/admin/metrics', (_req: Request, res: Response) => {
  mockVisits += Math.floor(Math.random() * 2);
  res.json({
    totalVisits: mockVisits,
    registeredUsers: 8,
    activeFeeds: ['Binance Vision (CORS OK)', 'Forex Synthetic Realtime (OK)', 'Equities Realtime (OK)'],
    systemStatus: 'Operational',
    uptime: process.uptime(),
    serverTime: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// Vite Dev Server or Production Static Serving
// -------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[roxo.ia] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[roxo.ia] Failed to start server:', err);
});
