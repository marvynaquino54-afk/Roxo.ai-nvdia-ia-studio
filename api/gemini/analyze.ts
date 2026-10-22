import { GoogleGenAI } from '@google/genai';

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbol, timeframe, probability, score, ev, indicators, setupName, rulesStatus, payout } = req.body || {};

  if (!aiClient) {
    const verdict = probability >= 60 ? 'CALL (COMPRA)' : probability <= 40 ? 'PUT (VENDA)' : 'NEUTRO / ESPERAR';
    return res.status(200).json({
      verdict,
      confidence: Math.round(Math.abs((probability || 50) - 50) * 1.8),
      recommendation: `Análise estatística para ${symbol} (${timeframe}): Setup "${setupName}" com probabilidade matemática de ${probability}%. Payout de ${payout}%. Configure sua GEMINI_API_KEY na Vercel para ativar o modelo de linguagem completo.`,
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
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    return res.status(200).json({
      verdict: parsed.verdict || (probability >= 55 ? 'CALL (COMPRA)' : 'NEUTRO'),
      confidence: parsed.confidenceScore || Math.round(probability),
      recommendation: parsed.rationale || 'Análise calculada com base no modelo estatístico.',
      confluences: parsed.keyConfluences || [],
      riskWarning: parsed.riskWarning || 'Mantenha disciplina e teto de stop loss diário.',
      aiPowered: true,
    });
  } catch (error: any) {
    return res.status(200).json({
      verdict: probability >= 60 ? 'CALL (COMPRA)' : 'NEUTRO',
      confidence: Math.round(probability),
      recommendation: `Análise calculada pelo motor probabilístico: probabilidade de ${probability}%.`,
      confluences: ['Motor probabilístico local ativo'],
      aiPowered: false,
      fallbackError: error.message,
    });
  }
}
