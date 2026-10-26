import express, { Request, Response, NextFunction } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_TIMEOUT_MS = 25000;
const MAX_IMAGE_BASE64_CHARS = 8_000_000;
const MT5_INGEST_TOKEN = (process.env.MT5_INGEST_TOKEN || '').trim();

app.use(express.json({ limit: '10mb' }));

// Basic hardening headers (no CSP: the dev bundle uses inline styles/eval)
app.use((_req: Request, res: Response, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Simple in-memory rate limit for the paid AI endpoints (30 req/min per IP)
const aiRateBuckets = new Map<string, number[]>();
function aiRateLimit(req: Request, res: Response, next: () => void) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (aiRateBuckets.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 30) {
    return res.status(429).json({
      error: 'Muitas chamadas de IA em pouco tempo. Aguarde um minuto e tente novamente.',
    });
  }
  recent.push(now);
  aiRateBuckets.set(ip, recent);
  if (aiRateBuckets.size > 5000) aiRateBuckets.clear();
  next();
}

// Initialize Google GenAI on the server
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      timeout: GEMINI_TIMEOUT_MS,
      headers: {
        'User-Agent': 'roxoia-server',
      },
    },
  });
}

// -------------------------------------------------------------
// Real Universal Market Data Feed (Yahoo Finance & MT5 Bridge)
// -------------------------------------------------------------
interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// In-memory store for MT5 live feeds posted by local bridge scripts
const mt5Store: Record<string, { symbol: string; timeframe: string; updatedAt: number; candles: Candle[] }> = {};
const ALLOWED_TIMEFRAMES = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);

// MT5 Webhook / Bridge endpoint
app.post('/api/market/mt5-ingest', (req: Request, res: Response) => {
  if (MT5_INGEST_TOKEN && req.headers['x-mt5-token'] !== MT5_INGEST_TOKEN) {
    return res.status(403).json({ error: 'Token da ponte MT5 inválido.' });
  }

  const { symbol, timeframe = '5m', candles } = req.body || {};

  if (typeof symbol !== 'string' || !/^[A-Za-z0-9.\-]{2,20}$/.test(symbol.trim())) {
    return res.status(400).json({ error: 'Parâmetro symbol inválido (2 a 20 letras, números, ponto ou hífen).' });
  }
  if (!ALLOWED_TIMEFRAMES.has(String(timeframe))) {
    return res.status(400).json({ error: `Timeframe inválido. Use: ${Array.from(ALLOWED_TIMEFRAMES).join(', ')}.` });
  }
  if (!Array.isArray(candles) || candles.length < 5 || candles.length > 5000) {
    return res.status(400).json({ error: 'candles deve ser um array com 5 a 5000 velas.' });
  }
  const normalized: Candle[] = [];
  for (const c of candles) {
    const t = Number(c?.t);
    const o = Number(c?.o);
    const h = Number(c?.h);
    const l = Number(c?.l);
    const close = Number(c?.c);
    const v = c?.v === undefined ? 0 : Number(c.v);
    if (![t, o, h, l, close, v].every(Number.isFinite)) {
      return res.status(400).json({ error: 'Cada vela precisa ter t, o, h, l, c e v numéricos.' });
    }
    if (h < l || o <= 0 || close <= 0) {
      return res.status(400).json({ error: 'Vela inválida: preços devem ser positivos e h >= l.' });
    }
    normalized.push({ t, o, h, l, c: close, v });
  }

  const cleanSymbol = symbol.trim().toUpperCase();
  const key = `${cleanSymbol}_${String(timeframe)}`;
  if (!mt5Store[key] && Object.keys(mt5Store).length >= 200) {
    const oldestKey = Object.keys(mt5Store).sort((a, b) => mt5Store[a].updatedAt - mt5Store[b].updatedAt)[0];
    delete mt5Store[oldestKey];
  }
  mt5Store[key] = {
    symbol: cleanSymbol,
    timeframe: String(timeframe),
    updatedAt: Date.now(),
    candles: normalized,
  };
  return res.json({ success: true, count: normalized.length, receivedAt: new Date().toISOString() });
});

function aggregateCandles(candles: Candle[], bucketMs: number): Candle[] {
  if (candles.length === 0) return [];
  const out: Candle[] = [];
  let current: Candle | null = null;
  let bucket = 0;

  for (const candle of candles) {
    const candleBucket = Math.floor(candle.t / bucketMs) * bucketMs;
    if (!current || candleBucket !== bucket) {
      if (current) out.push(current);
      bucket = candleBucket;
      current = { ...candle, t: candleBucket };
    } else {
      current.h = Math.max(current.h, candle.h);
      current.l = Math.min(current.l, candle.l);
      current.c = candle.c;
      current.v += candle.v;
    }
  }
  if (current) out.push(current);
  return out;
}

async function fetchRealMarketCandles(
  symbol: string,
  timeframe: string,
  limit = 160
): Promise<{ candles: Candle[]; source: string; providerName: string }> {
  const cleanSym = symbol.toUpperCase().replace('/', '').trim();
  const mt5Key = `${cleanSym}_${timeframe}`;

  // 1. Check if MT5 script sent recent candles (within last 30 minutes)
  const mt5Entry = mt5Store[mt5Key];
  if (mt5Entry && Date.now() - mt5Entry.updatedAt < 1800000 && mt5Entry.candles.length >= 5) {
    return {
      candles: mt5Entry.candles.slice(-limit),
      source: 'mt5',
      providerName: 'MetaTrader 5 Bridge (Real MT5 Ingest)',
    };
  }

  // 2. Map symbol to Yahoo Finance ticker
  let yahooTicker = cleanSym;
  const FIAT_PAIR = /^(EUR|GBP|USD|JPY|AUD|CAD|CHF|NZD|CNY)(EUR|GBP|USD|JPY|AUD|CAD|CHF|NZD|CNY)$/;
  const isForex = FIAT_PAIR.test(cleanSym);
  if (isForex) {
    yahooTicker = `${cleanSym}=X`;
  }

  // Map timeframe to Yahoo interval
  const intervalMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '60m',
    '4h': '60m',
    '1d': '1d',
  };
  const interval = intervalMap[timeframe] || '5m';
  const range = (timeframe === '1m' || timeframe === '5m') ? '2d' : (timeframe === '15m' || timeframe === '30m') ? '5d' : timeframe === '4h' ? '3mo' : '1mo';

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=${interval}&range=${range}`;

  const response = await fetch(yahooUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance retornou status ${response.status}`);
  }

  const json: any = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error('Formato inesperado dos dados de mercado');
  }

  const timestamps: number[] = result.timestamp;
  const quote = result.indicators.quote[0];
  const opens: number[] = quote.open;
  const highs: number[] = quote.high;
  const lows: number[] = quote.low;
  const closes: number[] = quote.close;
  const volumes: number[] = quote.volume || [];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (o !== null && h !== null && l !== null && c !== null && !isNaN(o) && !isNaN(c)) {
      candles.push({
        t: timestamps[i] * 1000,
        o: Number(o.toFixed(isForex ? 5 : 2)),
        h: Number(h.toFixed(isForex ? 5 : 2)),
        l: Number(l.toFixed(isForex ? 5 : 2)),
        c: Number(c.toFixed(isForex ? 5 : 2)),
        v: volumes[i] ? Math.round(volumes[i]) : 0,
      });
    }
  }

  if (candles.length < 5) {
    throw new Error('Velas insuficientes retornadas pelo feed oficial');
  }

  // A Yahoo não oferece H4 nativo: agrupamos 4 velas de 1h em buckets UTC de 4h.
  const finalCandles = timeframe === '4h' ? aggregateCandles(candles, 4 * 60 * 60 * 1000) : candles;

  if (finalCandles.length < 5) {
    throw new Error('Velas H4 insuficientes após agregação');
  }

  return {
    candles: finalCandles.slice(-limit),
    source: 'yahoo',
    providerName: timeframe === '4h' ? 'Yahoo Finance (H4 agregado de velas 1h)' : 'Yahoo Finance Live v8',
  };
}

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// 1. Real Market Candlestick API (Zero Synthetic Data)
app.get('/api/market/candles', async (req: Request, res: Response) => {
  const symbol = String(req.query.symbol || 'EURUSD').toUpperCase().replace(/[^A-Z0-9.\-^]/g, '').slice(0, 12) || 'EURUSD';
  const timeframe = ALLOWED_TIMEFRAMES.has(String(req.query.timeframe)) ? String(req.query.timeframe) : '5m';
  const limit = Math.min(500, Math.max(20, Number(req.query.limit) || 160));

  try {
    const realData = await fetchRealMarketCandles(symbol, timeframe, limit);
    return res.json({
      symbol,
      timeframe,
      count: realData.candles.length,
      source: realData.source,
      providerName: realData.providerName,
      isReal: true,
      candles: realData.candles,
    });
  } catch (err: any) {
    return res.status(503).json({
      error: 'Provedor em tempo real indisponível. Sinais bloqueados.',
      details: err.message,
      candles: [],
      isReal: false,
    });
  }
});

// Helper to resolve an active GenAI client (server env or request header)
function resolveAiClient(customKey?: string): GoogleGenAI | null {
  const key = (customKey || process.env.GEMINI_API_KEY || '').trim();
  if (!key) return null;
  if (!customKey && aiClient) return aiClient;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      timeout: GEMINI_TIMEOUT_MS,
      headers: {
        'User-Agent': 'roxoia-server',
      },
    },
  });
}

// 2. Gemini AI - Binary Options Confluence, Multi-Persona & Entry Analysis
app.post('/api/gemini/analyze', aiRateLimit, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { symbol, timeframe, probability, score, ev, indicators, setupName, rulesStatus, payout, role = 'analista' } = req.body || {};

  if (typeof symbol !== 'string' || !symbol.trim() || typeof timeframe !== 'string' || !timeframe.trim()) {
    return res.status(400).json({ error: 'symbol e timeframe são obrigatórios.' });
  }
  if (!Number.isFinite(Number(probability)) || !Number.isFinite(Number(payout))) {
    return res.status(400).json({ error: 'probability e payout devem ser numéricos.' });
  }
  if (!['analista', 'professor', 'auditor', 'explicador', 'setup', 'revisor'].includes(String(role))) {
    return res.status(400).json({ error: 'role inválido.' });
  }

  const safeSymbol = symbol.trim().slice(0, 20);
  const safeTimeframe = timeframe.trim().slice(0, 10);
  const safeSetupName = String(setupName || 'Setup').slice(0, 80);
  const safeRulesStatus = String(rulesStatus || '').slice(0, 300);
  const probabilityNum = Number(probability);
  const evNum = Number(ev || 0);
  const evProvided = Number.isFinite(Number(ev));
  const payoutNum = Number(payout);

  const customKey = (req.headers['x-gemini-key'] as string) || req.body?.apiKey;
  const client = resolveAiClient(customKey);

  // Persona instructions
  const roleInstructions: Record<string, { title: string; instruction: string }> = {
    analista: {
      title: 'Analista Quantitativo Institucional',
      instruction: 'Seja cirúrgico, objetivo e focado em confluências técnicas entre ação de preço (Price Action), rejeição de pavio e osciladores.',
    },
    professor: {
      title: 'Professor & Mentor de Trading',
      instruction: 'Explique de forma extremamente clara e didática para um trader iniciante. Use analogias simples e ensine o conceito que motivou a decisão.',
    },
    auditor: {
      title: 'Auditor de Risco & Payout',
      instruction: 'Seja conservador e crítico. Avalie se o payout atual da corretora compensa o risco matemático e alerte sobre possíveis manipulações de vela ou notícias.',
    },
    explicador: {
      title: 'Explicador Estatístico & Bayesiano',
      instruction: 'Desconstrua a matemática: explique o peso das regras, o desvio estatístico e por que essa probabilidade foi atingida na amostra.',
    },
    setup: {
      title: 'Otimizador de Parâmetros de Setup',
      instruction: 'Analise a volatilidade e sugira eventuais ajustes nos períodos de RSI, médias móveis ou tempo de expiração para este ativo.',
    },
    revisor: {
      title: 'Revisor Crítico & Disciplina',
      instruction: 'Aponte o que pode dar errado na operação (lado reverso) e reforce com firmeza a regra de stop loss e gestão de banca.',
    },
  };

  const selectedRole = roleInstructions[role] || roleInstructions.analista;

  if (!client) {
    // Deterministic statistical breakdown fallback when key is not attached yet
    const verdict = probabilityNum >= 58 ? 'CALL (COMPRA)' : probabilityNum <= 42 ? 'PUT (VENDA)' : 'NEUTRO / ESPERAR';
    const breakEvenWinRate = payoutNum ? Number((100 / (100 + payoutNum) * 100).toFixed(1)) : 54.1;
    const isEdgePositive = probabilityNum > breakEvenWinRate;

    return res.json({
      verdict,
      confidence: Math.min(95, Math.max(30, Math.round(Math.abs(probabilityNum - 50) * 1.9 + 40))),
      recommendation: `[${selectedRole.title}] Análise estatística para ${safeSymbol} (${safeTimeframe}): Setup "${safeSetupName}" com probabilidade calculada de ${probabilityNum}%. Payout de ${payoutNum}%, exigindo Win Rate de equilíbrio de ${breakEvenWinRate}%. ${isEdgePositive ? 'Vantagem matemática favorável (+Edge).' : 'Abaixo da taxa de equilíbrio (Risco elevado).'} Respeite o limite diário de stop loss.`,
      confluences: [
        `Probabilidade estimada: ${probabilityNum}%`,
        `Taxa de Equilíbrio (Break-Even): ${breakEvenWinRate}%`,
        `Filtro de Ruído: ${safeRulesStatus || 'Não informado'}`,
        evProvided ? `Esperança Matemática: ${evNum >= 0 ? '+' : ''}${evNum}%` : 'Esperança Matemática: Não informada',
      ],
      riskWarning: 'Modo Estatístico Local Ativo. Para ativar o modelo Gemini 3.6 Flash, adicione sua chave gratuita na aba Conexão.',
      role,
      roleTitle: selectedRole.title,
      executionTimeMs: Date.now() - startTime,
      modelUsed: 'Motor Estatístico Local',
      aiPowered: false,
      fallbackMode: true,
    });
  }

  try {
    const prompt = `Você está atuando como "${selectedRole.title}".
Diretriz de atuação: ${selectedRole.instruction}

Analise os seguintes dados da próxima vela de expiração para Opções Binárias:
- Ativo: ${safeSymbol}
- Tempo Gráfico / Expiração: ${safeTimeframe}
- Setup Utilizado: ${safeSetupName}
- Probabilidade Estatística Estimada: ${probabilityNum}%
- Score do Setup (0 a 100): ${Number(score || 0)}
- Esperança Matemática (EV): ${evNum}%
- Payout da Corretora: ${payoutNum}%
- Leitura dos Indicadores: ${JSON.stringify(indicators || {}).slice(0, 2000)}
- Regras Satisfeitas: ${safeRulesStatus}

Retorne ESTRITAMENTE um objeto JSON válido (sem tags markdown ou texto fora do JSON):
{
  "verdict": "CALL (COMPRA)" | "PUT (VENDA)" | "NEUTRO / NÃO OPERAR",
  "confidenceScore": número inteiro de 0 a 100,
  "rationale": "Explicação concisa e precisa de 2 a 3 frases no tom do seu papel (${selectedRole.title}).",
  "keyConfluences": ["confluência 1", "confluência 2", "confluência 3"],
  "riskWarning": "aviso de disciplina, volatilidade ou payout para este momento"
}`;

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    return res.json({
      verdict: parsed.verdict || (probabilityNum >= 55 ? 'CALL (COMPRA)' : 'NEUTRO'),
      confidence: parsed.confidenceScore || Math.round(probabilityNum),
      recommendation: parsed.rationale || 'Análise calculada com base no modelo estatístico.',
      confluences: parsed.keyConfluences || [],
      riskWarning: parsed.riskWarning || 'Mantenha disciplina e teto de stop loss diário.',
      role,
      roleTitle: selectedRole.title,
      executionTimeMs: Date.now() - startTime,
      modelUsed: GEMINI_MODEL,
      aiPowered: true,
      fallbackMode: false,
    });
  } catch (error: any) {
    console.error('Gemini analyze error:', error);
    return res.status(200).json({
      verdict: probabilityNum >= 58 ? 'CALL (COMPRA)' : probabilityNum <= 42 ? 'PUT (VENDA)' : 'NEUTRO / ESPERAR',
      confidence: Math.round(probabilityNum),
      recommendation: `[${selectedRole.title}] Parecer estatístico: Probabilidade de ${probabilityNum}% no setup ${safeSetupName}. O motor probabilístico local assumiu a recomendação.`,
      confluences: ['Motor probabilístico local ativo', 'Filtros avaliados com sucesso'],
      riskWarning: 'O servidor de IA encontrou instabilidade temporária e usou o motor probabilístico local.',
      role,
      roleTitle: selectedRole.title,
      executionTimeMs: Date.now() - startTime,
      modelUsed: 'Motor Estatístico Local (Fallback)',
      aiPowered: false,
      fallbackMode: true,
      fallbackError: error.message,
    });
  }
});

// 3. Gemini AI - Automated Performance & Session Report
app.post('/api/gemini/report', aiRateLimit, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { sessionData, bankroll, totalOps, winRate, profitLoss } = req.body || {};

  const totalOpsNum = Number(totalOps);
  const winRateNum = Number(winRate);
  const profitLossNum = Number(profitLoss);
  const bankrollNum = Number(bankroll);
  if (![totalOpsNum, winRateNum, profitLossNum, bankrollNum].every(Number.isFinite)) {
    return res.status(400).json({ error: 'bankroll, totalOps, winRate e profitLoss devem ser numéricos.' });
  }

  const safeSession = Array.isArray(sessionData) ? sessionData.slice(0, 20) : [];
  const customKey = (req.headers['x-gemini-key'] as string) || req.body?.apiKey;
  const client = resolveAiClient(customKey);

  if (!client) {
    const opLabel = totalOpsNum === 1 ? '1 operação' : `${totalOpsNum} operações`;
    return res.json({
      title: 'Relatório Executivo de Desempenho Quantitativo',
      summary: `Sessão finalizada com ${opLabel} e taxa de acerto de ${winRateNum}%. Resultado financeiro: R$ ${profitLossNum} na banca de R$ ${bankrollNum}.`,
      strengths:
        totalOpsNum <= 0
          ? ['Nenhuma operação registrada nesta sessão — não há desempenho a avaliar.']
          : [
              winRateNum >= 60
                ? `Taxa de acerto de ${winRateNum}% acima da referência de 60%`
                : `Amostra de ${opLabel} registrada para análise`,
            ],
      improvements:
        totalOpsNum <= 0
          ? ['Registre operações no diário para gerar um diagnóstico com dados reais']
          : ['Conecte sua chave Gemini gratuita para diagnósticos comportamentais avançados'],
      verdict: winRateNum >= 60 ? 'APROVADO / LUCRATIVO' : 'ATENÇÃO / REVISAR SETUPS',
      executionTimeMs: Date.now() - startTime,
      modelUsed: 'Motor Estatístico Local',
      aiPowered: false,
      fallbackMode: true,
    });
  }

  try {
    const prompt = `Como um mentor quantitativo de trading e opções binárias sênior, elabore um relatório executivo profissional avaliando a sessão de operações abaixo:
- Banca Inicial/Atual: ${bankrollNum}
- Total de Operações: ${totalOpsNum}
- Taxa de Acerto (Win Rate): ${winRateNum}%
- Lucro/Prejuízo: ${profitLossNum}
- Dados das Operações: ${JSON.stringify(safeSession).slice(0, 4000)}

Retorne ESTRITAMENTE um objeto JSON no formato:
{
  "title": "título executivo do relatório",
  "summary": "resumo de 2 a 3 frases com diagnóstico do desempenho e expectativa matemática",
  "strengths": ["ponto forte 1", "ponto forte 2"],
  "improvements": ["ajuste sugerido de gestão", "ajuste de filtro de ruído"],
  "verdict": "APROVADO / LUCRATIVO" | "ATENÇÃO / REVISAR SETUPS" | "STOP ATINGIDO"
}`;

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      ...parsed,
      executionTimeMs: Date.now() - startTime,
      modelUsed: GEMINI_MODEL,
      aiPowered: true,
      fallbackMode: false,
    });
  } catch (error: any) {
    console.error('Gemini report error:', error);
    return res.json({
      title: 'Relatório Quantitativo de Sessão',
      summary: `Desempenho com ${totalOpsNum} operações, Win Rate de ${winRateNum}%. Resultado: R$ ${profitLossNum}.`,
      strengths: ['Operações registradas'],
      improvements: ['Revisar pares com menor assertividade'],
      verdict: winRateNum >= 60 ? 'APROVADO / LUCRATIVO' : 'ATENÇÃO / REVISAR SETUPS',
      executionTimeMs: Date.now() - startTime,
      modelUsed: 'Motor Estatístico Local',
      aiPowered: false,
      fallbackMode: true,
    });
  }
});

// 4. Gemini AI - Vision Computer OCR for Trading Charts
app.post('/api/gemini/vision', aiRateLimit, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { imageBase64, mimeType = 'image/png' } = req.body || {};
  const customKey = (req.headers['x-gemini-key'] as string) || req.body?.apiKey;
  const client = resolveAiClient(customKey);

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({
      isValidChart: false,
      confidence: 0,
      symbolDetected: null,
      timeframeDetected: null,
      priceScaleDetected: null,
      patternsDetected: [],
      trendDetected: 'INDEFINIDO',
      rejectionReason: 'Não foi possível validar esta imagem com segurança.',
      summary: 'Nenhuma imagem foi transmitida para auditoria.',
    });
  }

  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return res.status(413).json({
      isValidChart: false,
      confidence: 0,
      symbolDetected: null,
      timeframeDetected: null,
      priceScaleDetected: null,
      patternsDetected: [],
      trendDetected: 'INDEFINIDO',
      rejectionReason: 'Não foi possível validar esta imagem com segurança.',
      summary: 'Imagem grande demais para auditoria. Envie um print de até ~6 MB.',
    });
  }

  // Sanitize base64
  let cleanBase64 = imageBase64;
  let cleanMime = String(mimeType);
  if (imageBase64.includes(';base64,')) {
    const parts = imageBase64.split(';base64,');
    cleanBase64 = parts[1];
    const mimeMatch = parts[0].match(/data:(.*?)$/);
    if (mimeMatch) cleanMime = mimeMatch[1];
  }

  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(cleanMime.toLowerCase())) {
    return res.status(415).json({
      isValidChart: false,
      confidence: 0,
      symbolDetected: null,
      timeframeDetected: null,
      priceScaleDetected: null,
      patternsDetected: [],
      trendDetected: 'INDEFINIDO',
      rejectionReason: 'Não foi possível validar esta imagem com segurança.',
      summary: 'Formato não suportado. Envie PNG, JPEG ou WebP.',
    });
  }

  if (!client) {
    return res.json({
      isValidChart: false,
      confidence: 45,
      symbolDetected: null,
      timeframeDetected: null,
      priceScaleDetected: null,
      patternsDetected: [],
      trendDetected: 'INDEFINIDO',
      rejectionReason: 'Não foi possível validar esta imagem com segurança.',
      summary: 'Para validação neural com leitura de eixos e velas, conecte sua chave Gemini na aba Conexão.',
      executionTimeMs: Date.now() - startTime,
    });
  }

  try {
    const imagePart = {
      inlineData: {
        mimeType: cleanMime,
        data: cleanBase64,
      },
    };

    const promptText = `Você é um auditor sênior de visão computacional financeira institucional e OCR de gráficos (Bloomberg, TradingView, MetaTrader, IQ Option, Exnova, Pocket Option, Binance).

Analise esta imagem minuciosamente para identificar se ela é um GRÁFICO DE TRADING REAL E LEGÍVEL:
1. Verifique a legibilidade dos eixos:
   - Eixo vertical de PREÇOS (com cotações numéricas visíveis nas bordas)
   - Eixo horizontal de TEMPO ou velas japonesas/barras distintas
2. Identifique os dados técnicos:
   - Ativo / Par negociado (Ex: EURUSD, BTCUSDT, GBPUSD, USDJPY, AAPL, etc.). Procure no cabeçalho superior esquerdo, marcas d'água no fundo ou abas de ativos.
   - Tempo gráfico / Timeframe (Ex: M1, M5, M15, M30, H1, H4, D1).
   - Faixa de preço visível (preço mínimo, preço máximo e preço da última vela / cotação atual).
   - Padrões de candlestick visíveis nas velas recentes (ex: Martelo / Hammer, Estrela Cadente / Shooting Star, Engolfo, Doji, Marubozu, Pinbar de Rejeição, Padrão de Reversão).
   - Tendência imediata visível (ALTA, BAIXA, LATERAL, INDEFINIDO).
3. Regra ESTRITA de Integridade e Rejeição:
   - Se a imagem estiver embaçada, ilegível, cortada sem escala de preços, ou NÃO for um gráfico financeiro:
     Defina "isValidChart": false, "confidence": número menor que 70 (ex: 20 a 50), e "rejectionReason": "Não foi possível validar esta imagem com segurança."
   - Apenas se for um gráfico autêntico com velas e escala de preços legíveis, defina "isValidChart": true e confidence >= 70.

Retorne ESTRITAMENTE um JSON no seguinte formato (sem formatação markdown ou texto extra):
{
  "isValidChart": boolean,
  "confidence": number,
  "symbolDetected": string | null,
  "timeframeDetected": string | null,
  "priceMin": number | null,
  "priceMax": number | null,
  "currentPrice": number | null,
  "patternsDetected": string[],
  "trendDetected": "ALTA" | "BAIXA" | "LATERAL" | "INDEFINIDO",
  "rejectionReason": string | null,
  "summary": "Diagnóstico técnico conciso do gráfico e contexto detectado"
}`;

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: {
        parts: [imagePart, { text: promptText }],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');

    // Quality gate: enforce confidence threshold >= 70
    const confidence = Number(parsed.confidence) || 0;
    const isValid = Boolean(parsed.isValidChart) && confidence >= 70;

    if (!isValid) {
      return res.json({
        isValidChart: false,
        confidence,
        symbolDetected: parsed.symbolDetected || null,
        timeframeDetected: parsed.timeframeDetected || null,
        priceScaleDetected: null,
        patternsDetected: parsed.patternsDetected || [],
        trendDetected: parsed.trendDetected || 'INDEFINIDO',
        rejectionReason: 'Não foi possível validar esta imagem com segurança.',
        summary: parsed.summary || 'A imagem enviada não possui os eixos de preço legíveis ou a resolução é insuficiente para auditoria.',
        modelUsed: GEMINI_MODEL,
        executionTimeMs: Date.now() - startTime,
      });
    }

    // Normalize detected symbol
    let normSymbol = String(parsed.symbolDetected || 'EURUSD')
      .toUpperCase()
      .replace(/[\/\-_ ]/g, '')
      .trim();

    // Map common aliases
    if (normSymbol.includes('BTC') && !normSymbol.endsWith('USDT') && !normSymbol.endsWith('USD')) {
      normSymbol = 'BTCUSDT';
    } else if (normSymbol.includes('ETH') && !normSymbol.endsWith('USDT') && !normSymbol.endsWith('USD')) {
      normSymbol = 'ETHUSDT';
    } else if (normSymbol.length === 6 && (normSymbol.startsWith('EUR') || normSymbol.startsWith('GBP') || normSymbol.startsWith('USD') || normSymbol.startsWith('AUD'))) {
      // standard forex 6 letters e.g. EURUSD
    }

    // Normalize timeframe
    let normTf = String(parsed.timeframeDetected || '5m').toLowerCase().replace('m', '');
    if (normTf === '1' || normTf === '1m') normTf = '1m';
    else if (normTf === '5' || normTf === '5m') normTf = '5m';
    else if (normTf === '15' || normTf === '15m') normTf = '15m';
    else if (normTf === '30' || normTf === '30m') normTf = '30m';
    else if (normTf === '60' || normTf === '1h' || normTf === 'h1') normTf = '1h';
    else normTf = '5m';

    // Synchronize with verified real market feed (Never invent synthetic candles)
    try {
      const realFeed = await fetchRealMarketCandles(normSymbol, normTf, 100);
      return res.json({
        isValidChart: true,
        confidence,
        symbolDetected: normSymbol,
        timeframeDetected: normTf,
        priceScaleDetected: parsed.priceMin && parsed.priceMax ? {
          min: Number(parsed.priceMin),
          max: Number(parsed.priceMax),
          currentPrice: Number(parsed.currentPrice || parsed.priceMax),
        } : null,
        patternsDetected: parsed.patternsDetected || [],
        trendDetected: parsed.trendDetected || 'LATERAL',
        rejectionReason: null,
        summary: parsed.summary || `Gráfico autenticado com sucesso para ${normSymbol} (${normTf}). Sincronizado com feed institucional.`,
        syncedRealCandlesCount: realFeed.candles.length,
        syncedProvider: realFeed.providerName,
        candles: realFeed.candles,
        executionTimeMs: Date.now() - startTime,
      });
    } catch (feedErr: any) {
      // Fallback: If symbol is exotic or not mapped in Yahoo/MT5
      return res.json({
        isValidChart: true,
        confidence,
        symbolDetected: normSymbol,
        timeframeDetected: normTf,
        priceScaleDetected: parsed.priceMin && parsed.priceMax ? {
          min: Number(parsed.priceMin),
          max: Number(parsed.priceMax),
          currentPrice: Number(parsed.currentPrice || parsed.priceMax),
        } : null,
        patternsDetected: parsed.patternsDetected || [],
        trendDetected: parsed.trendDetected || 'LATERAL',
        rejectionReason: null,
        summary: `Gráfico ${normSymbol} validado pelo OCR. Recomenda-se selecionar um par oficial suportado para sincronização de velas.`,
        syncedRealCandlesCount: 0,
        syncedProvider: 'OCR Visual Audit',
        executionTimeMs: Date.now() - startTime,
      });
    }
  } catch (err: any) {
    console.error('Gemini vision OCR error:', err);
    return res.json({
      isValidChart: false,
      confidence: 30,
      symbolDetected: null,
      timeframeDetected: null,
      priceScaleDetected: null,
      patternsDetected: [],
      trendDetected: 'INDEFINIDO',
      rejectionReason: 'Não foi possível validar esta imagem com segurança.',
      summary: `Falha na auditoria visual: ${err.message || 'Erro inesperado no modelo de visão'}.`,
      executionTimeMs: Date.now() - startTime,
    });
  }
});

// 5. Admin Monitor Endpoint (dados reais do processo; sem métricas inventadas)
app.get('/api/admin/metrics', (_req: Request, res: Response) => {
  const mt5BridgeActive = Object.values(mt5Store).some((entry) => Date.now() - entry.updatedAt < 1800000);
  res.json({
    online: true,
    uptimeSec: Math.round(process.uptime()),
    runtime: `Node ${process.version}`,
    aiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    marketFeed: 'Yahoo Finance (proxy do servidor)',
    mt5BridgeActive,
    serverTime: new Date().toISOString(),
  });
});

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Rota de API não encontrada.' });
});

app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  console.error('[roxo.ia] Unhandled error:', err);
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Conteúdo grande demais. Reduza a imagem ou o payload.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
  }
  return res.status(500).json({ error: 'Erro interno do servidor.' });
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
