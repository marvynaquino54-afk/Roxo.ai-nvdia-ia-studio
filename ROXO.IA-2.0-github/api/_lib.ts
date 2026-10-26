import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL = 'gemini-3.6-flash';
export const GEMINI_TIMEOUT_MS = 25000;
export const MAX_IMAGE_BASE64_CHARS = 8_000_000;

export function resolveAiClient(customKey?: string): GoogleGenAI | null {
  const key = (customKey || process.env.GEMINI_API_KEY || '').trim();
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      timeout: GEMINI_TIMEOUT_MS,
      headers: {
        'User-Agent': 'roxoia-serverless',
      },
    },
  });
}

const buckets = new Map<string, number[]>();

export function aiRateLimit(req: any, res: any): boolean {
  const forwarded = req.headers?.['x-forwarded-for'];
  const ip = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (buckets.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 30) {
    res.status(429).json({ error: 'Muitas chamadas de IA em pouco tempo. Aguarde um minuto.' });
    return false;
  }
  recent.push(now);
  buckets.set(ip, recent);
  if (buckets.size > 5000) buckets.clear();
  return true;
}
