import { GEMINI_MODEL, aiRateLimit, resolveAiClient } from '../_lib';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!aiRateLimit(req, res)) return;

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
  const customKey = req.headers?.['x-gemini-key'] || req.body?.apiKey;
  const client = resolveAiClient(customKey);

  if (!client) {
    const opLabel = totalOpsNum === 1 ? '1 operação' : `${totalOpsNum} operações`;
    return res.status(200).json({
      title: 'Relatório Executivo de Desempenho Quantitativo',
      summary: `Sessão concluída com ${opLabel} e taxa de acerto de ${winRateNum}%. Resultado: R$ ${profitLossNum} na banca de R$ ${bankrollNum}.`,
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
          : ['Conecte sua chave Gemini gratuita na aba Conexão para análises de IA avançadas'],
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
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.status(200).json({
      ...parsed,
      executionTimeMs: Date.now() - startTime,
      modelUsed: GEMINI_MODEL,
      aiPowered: true,
      fallbackMode: false,
    });
  } catch (error: any) {
    console.error('Gemini report error:', error);
    return res.status(200).json({
      title: 'Relatório Quantitativo de Sessão',
      summary: `Desempenho com ${totalOpsNum} operações, Win Rate de ${winRateNum}%.`,
      strengths:
        totalOpsNum <= 0
          ? ['Nenhuma operação registrada nesta sessão — não há desempenho a avaliar.']
          : [`Amostra de ${totalOpsNum} operações registrada para análise`],
      improvements:
        totalOpsNum <= 0
          ? ['Registre operações no diário para gerar um diagnóstico com dados reais']
          : ['Revisar pares com menor assertividade'],
      verdict: winRateNum >= 60 ? 'APROVADO / LUCRATIVO' : 'ATENÇÃO / REVISAR SETUPS',
      executionTimeMs: Date.now() - startTime,
      modelUsed: 'Motor Estatístico Local (Fallback)',
      aiPowered: false,
      fallbackMode: true,
    });
  }
}
