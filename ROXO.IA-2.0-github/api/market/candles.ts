import { clampLimit, fetchYahooCandles, sanitizeSymbol, sanitizeTimeframe } from '../_market';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = req.query || {};
  const symbol = sanitizeSymbol(query.symbol);
  const timeframe = sanitizeTimeframe(query.timeframe);
  const limit = clampLimit(query.limit, 500, 160);

  try {
    const { candles } = await fetchYahooCandles(symbol, timeframe, limit);
    res.setHeader('Cache-Control', 'public, max-age=15');
    return res.status(200).json({
      symbol,
      timeframe,
      count: candles.length,
      source: 'yahoo',
      providerName:
        timeframe === '4h' ? 'Yahoo Finance (H4 agregado de velas 1h)' : 'Yahoo Finance Live v8',
      isReal: true,
      candles,
    });
  } catch (err: any) {
    return res.status(503).json({
      error: 'Provedor em tempo real indisponível. Sinais bloqueados.',
      details: err?.message || 'Falha ao consultar a Yahoo Finance',
      candles: [],
      isReal: false,
    });
  }
}
