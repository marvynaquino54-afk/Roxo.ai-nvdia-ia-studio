import { GEMINI_MODEL, MAX_IMAGE_BASE64_CHARS, aiRateLimit, resolveAiClient } from '../_lib';
import { fetchYahooCandles } from '../_market';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!aiRateLimit(req, res)) return;

  const startTime = Date.now();
  const { imageBase64, mimeType = 'image/png' } = req.body || {};
  const customKey = req.headers?.['x-gemini-key'] || req.body?.apiKey;
  const client = resolveAiClient(customKey);

  const reject = (status: number, summary: string): void => {
    res.status(status).json({
      isValidChart: false,
      confidence: 0,
      symbolDetected: null,
      timeframeDetected: null,
      priceScaleDetected: null,
      patternsDetected: [],
      trendDetected: 'INDEFINIDO',
      rejectionReason: 'Não foi possível validar esta imagem com segurança.',
      summary,
      modelUsed: GEMINI_MODEL,
      executionTimeMs: Date.now() - startTime,
    });
  };

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return reject(400, 'Nenhuma imagem foi transmitida para auditoria.');
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return reject(413, 'Imagem grande demais para auditoria. Envie um print de até ~6 MB.');
  }

  let cleanBase64 = imageBase64;
  let cleanMime = String(mimeType);
  if (imageBase64.includes(';base64,')) {
    const parts = imageBase64.split(';base64,');
    cleanBase64 = parts[1];
    const mimeMatch = parts[0].match(/data:(.*?)$/);
    if (mimeMatch) cleanMime = mimeMatch[1];
  }
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(cleanMime.toLowerCase())) {
    return reject(415, 'Formato não suportado. Envie PNG, JPEG ou WebP.');
  }

  if (!client) {
    return res.status(200).json({
      isValidChart: false,
      confidence: 0,
      symbolDetected: null,
      timeframeDetected: null,
      priceScaleDetected: null,
      patternsDetected: [],
      trendDetected: 'INDEFINIDO',
      rejectionReason: 'Não foi possível validar esta imagem com segurança.',
      summary: 'Para validação visual, configure a GEMINI_API_KEY na Vercel ou insira sua chave na aba Conexão.',
      modelUsed: 'Nenhum modelo configurado',
      executionTimeMs: Date.now() - startTime,
    });
  }

  const promptText = `Você é um auditor sênior de visão computacional financeira e OCR de gráficos de trading.
Analise esta imagem e determine se é um gráfico de trading real e legível.

Regras:
1. Só aceite se houver eixo de preços com números legíveis E velas/barras distintas com eixo de tempo.
2. Se a imagem estiver ilegível, cortada ou não for um gráfico financeiro, defina isValidChart=false e confidence < 70.
3. Extraia o ativo, o timeframe, a faixa de preços visível, padrões de candle e a tendência imediata.

Retorne ESTRITAMENTE um JSON:
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
  "summary": "diagnóstico técnico conciso"
}`;

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: cleanMime, data: cleanBase64 } },
          { text: promptText },
        ],
      },
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    const confidence = Number(parsed.confidence) || 0;
    const isValid = Boolean(parsed.isValidChart) && confidence >= 70;

    if (!isValid) {
      return res.status(200).json({
        isValidChart: false,
        confidence,
        symbolDetected: parsed.symbolDetected || null,
        timeframeDetected: parsed.timeframeDetected || null,
        priceScaleDetected: null,
        patternsDetected: parsed.patternsDetected || [],
        trendDetected: parsed.trendDetected || 'INDEFINIDO',
        rejectionReason: 'Não foi possível validar esta imagem com segurança.',
        summary:
          parsed.summary ||
          'A imagem não possui eixos de preço legíveis ou nitidez suficiente para auditoria.',
        modelUsed: GEMINI_MODEL,
        executionTimeMs: Date.now() - startTime,
      });
    }

    let normSymbol = String(parsed.symbolDetected || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 12);
    if (!normSymbol) normSymbol = 'EURUSD';
    if (normSymbol.includes('BTC') && !normSymbol.endsWith('USDT')) normSymbol = 'BTCUSDT';
    else if (normSymbol.includes('ETH') && !normSymbol.endsWith('USDT')) normSymbol = 'ETHUSDT';

    const rawTf = String(parsed.timeframeDetected || '5m').toLowerCase().replace(/\s/g, '');
    let normTf = '5m';
    if (rawTf.includes('1') && !rawTf.includes('15')) normTf = '1m';
    else if (rawTf.includes('5')) normTf = '5m';
    else if (rawTf.includes('15')) normTf = '15m';
    else if (rawTf.includes('30')) normTf = '30m';
    else if (rawTf.includes('60') || rawTf.includes('1h') || rawTf.includes('h1')) normTf = '1h';
    else if (rawTf.includes('4h') || rawTf.includes('h4')) normTf = '4h';
    else if (rawTf.includes('d1') || rawTf.includes('1d')) normTf = '1d';

    const priceScaleDetected =
      parsed.priceMin !== null &&
      parsed.priceMax !== null &&
      parsed.priceMin !== undefined &&
      parsed.priceMax !== undefined
        ? {
            min: Number(parsed.priceMin),
            max: Number(parsed.priceMax),
            currentPrice: Number(parsed.currentPrice || parsed.priceMax),
          }
        : null;

    try {
      const { candles } = await fetchYahooCandles(normSymbol, normTf, 100);
      return res.status(200).json({
        isValidChart: true,
        confidence,
        symbolDetected: normSymbol,
        timeframeDetected: normTf,
        priceScaleDetected,
        patternsDetected: parsed.patternsDetected || [],
        trendDetected: parsed.trendDetected || 'LATERAL',
        rejectionReason: null,
        summary:
          parsed.summary ||
          `Gráfico autenticado para ${normSymbol} (${normTf}) e sincronizado com o feed oficial.`,
        syncedRealCandlesCount: candles.length,
        syncedProvider: 'Yahoo Finance Live v8',
        candles,
        modelUsed: GEMINI_MODEL,
        executionTimeMs: Date.now() - startTime,
      });
    } catch {
      return res.status(200).json({
        isValidChart: true,
        confidence,
        symbolDetected: normSymbol,
        timeframeDetected: normTf,
        priceScaleDetected,
        patternsDetected: parsed.patternsDetected || [],
        trendDetected: parsed.trendDetected || 'LATERAL',
        rejectionReason: null,
        summary:
          parsed.summary ||
          `Gráfico ${normSymbol} validado pelo OCR, mas sem sincronização de velas agora.`,
        syncedRealCandlesCount: 0,
        syncedProvider: 'OCR Visual (sem feed no momento)',
        modelUsed: GEMINI_MODEL,
        executionTimeMs: Date.now() - startTime,
      });
    }
  } catch (err: any) {
    console.error('Gemini vision error:', err);
    return res.status(200).json({
      isValidChart: false,
      confidence: 0,
      symbolDetected: null,
      timeframeDetected: null,
      priceScaleDetected: null,
      patternsDetected: [],
      trendDetected: 'INDEFINIDO',
      rejectionReason: 'Não foi possível validar esta imagem com segurança.',
      summary: `Falha na auditoria visual: ${err?.message || 'erro inesperado'}.`,
      modelUsed: GEMINI_MODEL,
      executionTimeMs: Date.now() - startTime,
    });
  }
}
