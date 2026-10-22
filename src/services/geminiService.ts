import { AIAnalysisResult } from '../types';

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
  }): Promise<AIAnalysisResult> {
    // 1. Try server endpoint first
    try {
      const res = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.verdict) {
          return data;
        }
      }
    } catch (err) {
      console.warn('Backend /api/gemini/analyze unreachable, trying direct client-side fallback...', err);
    }

    // 2. Direct client fallback using stored key
    const apiKey = this.getStoredKey();
    if (apiKey) {
      try {
        const prompt = `Você é um analista quantitativo sênior especialista em Opções Binárias e probabilidade matemática no mercado financeiro (Forex, Cripto e Ações).
Analise os seguintes dados em tempo real da próxima vela de expiração:
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
  "rationale": "Explicação concisa e técnica de 2 a 3 frases com base na probabilidade, payout e confluências de candlestick/indicadores.",
  "keyConfluences": ["confluência 1", "confluência 2", "ponto de atenção"],
  "riskWarning": "aviso de gestão ou filtro relevante para opções binárias (ex.: atenção a notícias ou volatilidade)"
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Google API HTTP ${res.status}: ${errText}`);
        }

        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(text);

        return {
          verdict: parsed.verdict || (payload.probability >= 58 ? 'CALL (COMPRA)' : 'NEUTRO'),
          confidence: parsed.confidenceScore || payload.probability,
          recommendation: parsed.rationale || 'Análise confluente baseada no modelo estatístico.',
          confluences: parsed.keyConfluences || [],
          riskWarning: parsed.riskWarning || 'Respeite a gestão de banca e limite diário.',
          aiPowered: true,
        };
      } catch (err: any) {
        console.error('Direct Gemini call failed:', err);
      }
    }

    // 3. Informative fallback when no key is set
    const defaultVerdict = payload.probability >= 58 ? 'CALL (COMPRA)' : payload.probability <= 42 ? 'PUT (VENDA)' : 'NEUTRO / ESPERAR';
    return {
      verdict: defaultVerdict,
      confidence: Math.round(Math.abs(payload.probability - 50) * 1.8),
      recommendation: `Análise calculada pelo motor quantitativo local: Probabilidade de ${payload.probability}% no setup "${payload.setupName}". Para ativar a IA avançada na Vercel, cole sua chave gratuita do Gemini na aba "Conexão & Vercel".`,
      confluences: [
        `Probabilidade calculada: ${payload.probability}%`,
        `Filtros de Ruído: ${payload.rulesStatus}`,
        `Esperança Matemática: ${payload.ev >= 0 ? '+' : ''}${payload.ev}%`,
      ],
      riskWarning: 'Chave Gemini não conectada. Conecte sua chave gratuita na aba Conexão para obter análise neural com o modelo Gemini Flash.',
      aiPowered: false,
    };
  },

  async generateReport(payload: {
    sessionData: any[];
    bankroll: number;
    totalOps: number;
    winRate: string;
    profitLoss: string;
  }): Promise<any> {
    try {
      const res = await fetch('/api/gemini/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {}

    const apiKey = this.getStoredKey();
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
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          return { ...JSON.parse(text), aiPowered: true };
        }
      } catch {}
    }

    return {
      title: 'Relatório Quantitativo de Desempenho',
      summary: `Sessão finalizada com ${payload.totalOps} operações e taxa de acerto de ${payload.winRate}%. Resultado acumulado: R$ ${payload.profitLoss}.`,
      strengths: ['Disciplina operacional mantida', 'Operações registradas no diário'],
      improvements: ['Adicione sua chave Gemini na aba Conexão para relatórios mais profundos'],
      verdict: Number(payload.winRate) >= 60 ? 'APROVADO / LUCRATIVO' : 'ATENÇÃO / REVISAR SETUPS',
      aiPowered: false,
    };
  },
};
