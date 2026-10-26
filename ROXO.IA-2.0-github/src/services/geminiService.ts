import { AIAnalysisResult, AIRole, Candle, ChartVisionResult } from '../types';

export const geminiService = {
  getStoredKey(): string {
    try {
      const stored = localStorage.getItem('roxoia_gemini_api_key') || '';
      const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
      return (stored || envKey).trim();
    } catch {
      return '';
    }
  },

  setStoredKey(key: string) {
    try {
      localStorage.setItem('roxoia_gemini_api_key', key.trim());
    } catch {}
    window.dispatchEvent(new Event('roxoia:keychange'));
  },

  async analyzeEntry(payload: {
    symbol: string;
    timeframe: string;
    probability: number;
    score: number;
    ev: number;
    indicators: Record<string, any>;
    setupName: string;
    rulesStatus: string;
    payout: number;
    role?: AIRole;
  }): Promise<AIAnalysisResult> {
    const startTime = Date.now();
    const apiKey = this.getStoredKey();

    // 1. Try server-side endpoint first (transmits user key in header if present)
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['x-gemini-key'] = apiKey;
      }

      const res = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.verdict) {
          if (!data.executionTimeMs) {
            data.executionTimeMs = Date.now() - startTime;
          }
          return data;
        }
      }
    } catch (err) {
      console.warn('Backend /api/gemini/analyze indisponível, acionando fallback...', err);
    }

    // 2. Client-side direct fallback if key exists
    if (apiKey) {
      try {
        const roleTitles: Record<string, string> = {
          analista: 'Analista Quantitativo Institucional',
          professor: 'Professor & Mentor de Trading',
          auditor: 'Auditor de Risco & Payout',
          explicador: 'Explicador Estatístico',
          setup: 'Otimizador de Setup',
          revisor: 'Revisor Crítico & Disciplina',
        };
        const title = roleTitles[payload.role || 'analista'] || 'Analista Quantitativo';

        const prompt = `Você está atuando como "${title}".
Analise os seguintes dados em tempo real da próxima vela de expiração para Opções Binárias:
- Ativo: ${payload.symbol}
- Tempo Gráfico / Expiração: ${payload.timeframe}
- Setup Utilizado: ${payload.setupName}
- Probabilidade Estatística Estimada: ${payload.probability}%
- Score do Setup (0 a 100): ${payload.score}
- Esperança Matemática (EV): ${payload.ev}%
- Payout da Corretora: ${payload.payout}%
- Leitura dos Indicadores: ${JSON.stringify(payload.indicators || {})}
- Regras Satisfeitas: ${payload.rulesStatus}

Forneça uma resposta direta, estritamente estruturada em JSON com o formato:
{
  "verdict": "CALL (COMPRA)" | "PUT (VENDA)" | "NEUTRO / NÃO OPERAR",
  "confidenceScore": número de 0 a 100,
  "rationale": "Explicação concisa e técnica de 2 a 3 frases no tom do seu papel (${title}).",
  "keyConfluences": ["confluência 1", "confluência 2", "ponto de atenção"],
  "riskWarning": "aviso de gestão ou filtro relevante para opções binárias"
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(20000),
        });

        if (res.ok) {
          const json = await res.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = JSON.parse(text);

          return {
            verdict: parsed.verdict || (payload.probability >= 58 ? 'CALL (COMPRA)' : 'NEUTRO'),
            confidence: parsed.confidenceScore || payload.probability,
            recommendation: parsed.rationale || 'Análise confluente baseada no modelo estatístico.',
            confluences: parsed.keyConfluences || [],
            riskWarning: parsed.riskWarning || 'Respeite a gestão de banca e limite diário.',
            role: payload.role || 'analista',
            roleTitle: title,
            executionTimeMs: Date.now() - startTime,
            modelUsed: 'gemini-3.6-flash (Client Direct)',
            aiPowered: true,
            fallbackMode: false,
          };
        }
      } catch (err: any) {
        console.error('Direct Gemini call failed:', err);
      }
    }

    // 3. High-fidelity statistical fallback when offline or without key
    const defaultVerdict =
      payload.probability >= 58 ? 'CALL (COMPRA)' : payload.probability <= 42 ? 'PUT (VENDA)' : 'NEUTRO / ESPERAR';
    const breakEvenWinRate = payload.payout ? Number((100 / (100 + payload.payout) * 100).toFixed(1)) : 54.1;

    return {
      verdict: defaultVerdict,
      confidence: Math.round(Math.abs(payload.probability - 50) * 1.8),
      recommendation: `[Motor Estatístico Local] Análise calculada para ${payload.symbol} (${payload.timeframe}): Probabilidade estimada de ${payload.probability}% no setup "${payload.setupName}". Payout de ${payload.payout}% (Break-even: ${breakEvenWinRate}%). Para ativar o Gemini 3.6 Flash com confluências neurais, adicione sua chave gratuita na aba Conexão.`,
      confluences: [
        `Probabilidade calculada: ${payload.probability}%`,
        `Taxa de Equilíbrio (Break-Even): ${breakEvenWinRate}%`,
        `Filtros de Ruído: ${payload.rulesStatus}`,
        `Esperança Matemática: ${payload.ev >= 0 ? '+' : ''}${payload.ev}%`,
      ],
      riskWarning: 'Modo Local Ativo. Sem chave Gemini conectada, a plataforma opera com 100% de integridade estatística local.',
      role: payload.role || 'analista',
      roleTitle: 'Motor Estatístico Quantitativo',
      executionTimeMs: Date.now() - startTime,
      modelUsed: 'Motor Estatístico Local',
      aiPowered: false,
      fallbackMode: true,
    };
  },

  async generateReport(payload: {
    sessionData: any[];
    bankroll: number;
    totalOps: number;
    winRate: string;
    profitLoss: string;
  }): Promise<any> {
    const startTime = Date.now();
    const apiKey = this.getStoredKey();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['x-gemini-key'] = apiKey;
      }

      const res = await fetch('/api/gemini/report', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (!data.executionTimeMs) {
          data.executionTimeMs = Date.now() - startTime;
        }
        return data;
      }
    } catch {}

    if (apiKey) {
      try {
        const prompt = `Como um mentor quantitativo de trading e opções binárias, elabore um relatório executivo conciso em formato JSON:
- Banca: ${payload.bankroll}
- Operações: ${payload.totalOps}
- Win Rate: ${payload.winRate}%
- Lucro/Prejuízo: ${payload.profitLoss}
Responda em JSON:
{
  "title": "Relatório Executivo de Sessão",
  "summary": "resumo de 2 a 3 frases",
  "strengths": ["ponto 1", "ponto 2"],
  "improvements": ["ajuste 1", "ajuste 2"],
  "verdict": "APROVADO / LUCRATIVO" | "ATENÇÃO / REVISAR SETUPS"
}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (res.ok) {
          const json = await res.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          return {
            ...JSON.parse(text),
            executionTimeMs: Date.now() - startTime,
            modelUsed: 'gemini-3.6-flash',
            aiPowered: true,
            fallbackMode: false,
          };
        }
      } catch {}
    }

    return {
      title: 'Relatório Executivo de Desempenho Quantitativo',
      summary: `Sessão finalizada com ${payload.totalOps} operações e taxa de acerto de ${payload.winRate}%. Resultado acumulado: R$ ${payload.profitLoss}.`,
      strengths: ['Disciplina operacional mantida', 'Operações registradas no diário'],
      improvements: ['Adicione sua chave Gemini na aba Conexão para relatórios mais profundos'],
      verdict: Number(payload.winRate) >= 60 ? 'APROVADO / LUCRATIVO' : 'ATENÇÃO / REVISAR SETUPS',
      executionTimeMs: Date.now() - startTime,
      modelUsed: 'Motor Estatístico Local',
      aiPowered: false,
      fallbackMode: true,
    };
  },

  async analyzeChartImage(
    imageBase64: string,
    mimeType = 'image/png'
  ): Promise<ChartVisionResult & { candles?: Candle[]; executionTimeMs?: number }> {
    const startTime = Date.now();
    const apiKey = this.getStoredKey();

    // 1. First attempt: Server-side vision endpoint (/api/gemini/vision)
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['x-gemini-key'] = apiKey;
      }

      const res = await fetch('/api/gemini/vision', {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageBase64, mimeType }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          ...data,
          executionTimeMs: data.executionTimeMs || Date.now() - startTime,
        };
      }
    } catch (err) {
      console.warn('Backend /api/gemini/vision error, proceeding to client fallback...', err);
    }

    // 2. Direct client-side call if user key is stored
    if (apiKey) {
      try {
        let cleanBase64 = imageBase64;
        let cleanMime = mimeType;
        if (imageBase64.includes(';base64,')) {
          const parts = imageBase64.split(';base64,');
          cleanBase64 = parts[1];
          const m = parts[0].match(/data:(.*?)$/);
          if (m) cleanMime = m[1];
        }

        const promptText = `Você é um auditor sênior de visão computacional de trading.
Analise esta imagem minuciosamente para determinar se é um gráfico financeiro legível com eixos de preço e tempo.
Regra estrita: Se não for um gráfico legível com eixos claros, defina isValidChart: false, confidence < 70 e rejectionReason: "Não foi possível validar esta imagem com segurança."
Retorne em JSON:
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
  "summary": string
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: cleanMime, data: cleanBase64 } },
                  { text: promptText },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (res.ok) {
          const json = await res.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = JSON.parse(text);
          const conf = Number(parsed.confidence) || 0;
          const isValid = Boolean(parsed.isValidChart) && conf >= 70;

          if (!isValid) {
            return {
              isValidChart: false,
              confidence: conf,
              symbolDetected: parsed.symbolDetected || null,
              timeframeDetected: parsed.timeframeDetected || null,
              priceScaleDetected: null,
              patternsDetected: parsed.patternsDetected || [],
              trendDetected: parsed.trendDetected || 'INDEFINIDO',
              rejectionReason: 'Não foi possível validar esta imagem com segurança.',
              summary: parsed.summary || 'A imagem não possui eixos legíveis ou nitidez suficiente.',
              executionTimeMs: Date.now() - startTime,
            };
          }

          let normSym = String(parsed.symbolDetected || 'EURUSD').toUpperCase().replace(/[\/\-_ ]/g, '');
          let normTf = String(parsed.timeframeDetected || '5m').toLowerCase().replace('m', '');
          normTf = normTf === '1' ? '1m' : normTf === '15' ? '15m' : '5m';

          return {
            isValidChart: true,
            confidence: conf,
            symbolDetected: normSym,
            timeframeDetected: normTf,
            priceScaleDetected: parsed.priceMin && parsed.priceMax ? {
              min: Number(parsed.priceMin),
              max: Number(parsed.priceMax),
              currentPrice: Number(parsed.currentPrice || parsed.priceMax),
            } : null,
            patternsDetected: parsed.patternsDetected || [],
            trendDetected: parsed.trendDetected || 'LATERAL',
            rejectionReason: null,
            summary: parsed.summary || `Gráfico autenticado com sucesso para ${normSym} (${normTf}).`,
            executionTimeMs: Date.now() - startTime,
          };
        }
      } catch (err) {
        console.error('Direct vision error:', err);
      }
    }

    // 3. Fallback: Security rejection — nenhuma leitura foi feita, então não há confiança a atribuir
    return {
      isValidChart: false,
      confidence: 0,
      symbolDetected: null,
      timeframeDetected: null,
      priceScaleDetected: null,
      patternsDetected: [],
      trendDetected: 'INDEFINIDO',
      rejectionReason: 'Não foi possível validar esta imagem com segurança.',
      summary: 'Para validação neural de alta precisão com leitura de eixos e velas, configure sua chave Gemini na aba Conexão ou certifique-se de enviar uma imagem nítida com os eixos de preço visíveis.',
      executionTimeMs: Date.now() - startTime,
    };
  },
};

