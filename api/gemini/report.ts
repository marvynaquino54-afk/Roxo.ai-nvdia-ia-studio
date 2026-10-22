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

  const { sessionData, bankroll, totalOps, winRate, profitLoss } = req.body || {};

  if (!aiClient) {
    return res.status(200).json({
      title: 'Relatório de Desempenho Estatístico',
      summary: `Sessão concluída com ${totalOps || 0} operações e taxa de acerto de ${winRate || 0}%. Resultado: ${profitLoss || 0} na banca de ${bankroll || 1000}.`,
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
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.status(200).json({ ...parsed, aiPowered: true });
  } catch (error: any) {
    return res.status(200).json({
      title: 'Relatório Quantitativo de Sessão',
      summary: `Desempenho com ${totalOps} operações, Win Rate de ${winRate}%.`,
      verdict: Number(winRate) >= 60 ? 'APROVADO / LUCRATIVO' : 'ATENÇÃO / REVISAR SETUPS',
      aiPowered: false,
    });
  }
}
