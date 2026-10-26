import { GEMINI_MODEL, aiRateLimit, resolveAiClient } from '../_lib';

const ROLE_INSTRUCTIONS: Record<string, { title: string; instruction: string }> = {
  analista: {
    title: 'Analista Quantitativo Institucional',
    instruction:
      'Seja cirúrgico, objetivo e focado em confluências técnicas entre ação de preço, rejeição de pavio e osciladores.',
  },
  professor: {
    title: 'Professor & Mentor de Trading',
    instruction:
      'Explique de forma extremamente clara e didática para um trader iniciante. Use analogias simples e ensine o conceito que motivou a decisão.',
  },
  auditor: {
    title: 'Auditor de Risco & Payout',
    instruction:
      'Seja conservador e crítico. Avalie se o payout atual da corretora compensa o risco matemático e alerte sobre possíveis manipulações de vela ou notícias.',
  },
  explicador: {
    title: 'Explicador Estatístico & Bayesiano',
    instruction:
      'Desconstrua a matemática: explique o peso das regras, o desvio estatístico e por que essa probabilidade foi atingida na amostra.',
  },
  setup: {
    title: 'Otimizador de Parâmetros de Setup',
    instruction:
      'Analise a volatilidade e sugira eventuais ajustes nos períodos de RSI, médias móveis ou tempo de expiração para este ativo.',
  },
  revisor: {
    title: 'Revisor Crítico & Disciplina',
    instruction:
      'Aponte o que pode dar errado na operação (lado reverso) e reforce com firmeza a regra de stop loss e gestão de banca.',
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!aiRateLimit(req, res)) return;

  const startTime = Date.now();
  const {
    symbol,
    timeframe,
    probability,
    score,
    ev,
    indicators,
    setupName,
    rulesStatus,
    payout,
    role = 'analista',
  } = req.body || {};

  if (typeof symbol !== 'string' || !symbol.trim() || typeof timeframe !== 'string' || !timeframe.trim()) {
    return res.status(400).json({ error: 'symbol e timeframe são obrigatórios.' });
  }
  const probabilityNum = Number(probability);
  const payoutNum = Number(payout);
  if (!Number.isFinite(probabilityNum) || !Number.isFinite(payoutNum)) {
    return res.status(400).json({ error: 'probability e payout devem ser numéricos.' });
  }
  if (!Object.prototype.hasOwnProperty.call(ROLE_INSTRUCTIONS, role)) {
    return res.status(400).json({ error: 'role inválido.' });
  }

  const selectedRole = ROLE_INSTRUCTIONS[role] || ROLE_INSTRUCTIONS.analista;
  const safeSymbol = symbol.trim().slice(0, 20);
  const safeTimeframe = timeframe.trim().slice(0, 10);
  const safeSetupName = String(setupName || 'Setup').slice(0, 80);
  const safeRulesStatus = String(rulesStatus || '').slice(0, 300);
  const evNum = Number(ev || 0);
  const evProvided = Number.isFinite(Number(ev));

  const customKey = req.headers?.['x-gemini-key'] || req.body?.apiKey;
  const client = resolveAiClient(customKey);

  if (!client) {
    const verdict =
      probabilityNum >= 58 ? 'CALL (COMPRA)' : probabilityNum <= 42 ? 'PUT (VENDA)' : 'NEUTRO / ESPERAR';
    const breakEvenWinRate = payoutNum ? Number(((100 / (100 + payoutNum)) * 100).toFixed(1)) : 54.1;

    return res.status(200).json({
      verdict,
      confidence: Math.min(95, Math.max(30, Math.round(Math.abs(probabilityNum - 50) * 1.9 + 40))),
      recommendation: `[${selectedRole.title}] Análise estatística para ${safeSymbol} (${safeTimeframe}): Setup "${safeSetupName}" com probabilidade calculada de ${probabilityNum}%. Payout de ${payoutNum}%, exigindo Win Rate de equilíbrio de ${breakEvenWinRate}%.`,
      confluences: [
        `Probabilidade calculada: ${probabilityNum}%`,
        `Taxa de Equilíbrio: ${breakEvenWinRate}%`,
        `Filtro de Ruído: ${safeRulesStatus || 'Não informado'}`,
        evProvided ? `Risco/Retorno Esperado: ${evNum >= 0 ? 'Positivo' : 'Negativo'}` : 'Risco/Retorno Esperado: Não informado',
      ],
      riskWarning:
        'Modo Estatístico Local Ativo. Configure a GEMINI_API_KEY na Vercel ou insira sua chave na aba Conexão.',
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
  "riskWarning": "aviso de gestão ou filtro relevante para opções binárias"
}`;

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');

    return res.status(200).json({
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
      verdict:
        probabilityNum >= 58 ? 'CALL (COMPRA)' : probabilityNum <= 42 ? 'PUT (VENDA)' : 'NEUTRO / ESPERAR',
      confidence: Math.round(probabilityNum),
      recommendation: `[${selectedRole.title}] Análise calculada pelo motor probabilístico: probabilidade de ${probabilityNum}% no setup ${safeSetupName}.`,
      confluences: ['Motor probabilístico local ativo'],
      role,
      roleTitle: selectedRole.title,
      executionTimeMs: Date.now() - startTime,
      modelUsed: 'Motor Estatístico Local (Fallback)',
      aiPowered: false,
      fallbackMode: true,
      fallbackError: error?.message,
    });
  }
}
