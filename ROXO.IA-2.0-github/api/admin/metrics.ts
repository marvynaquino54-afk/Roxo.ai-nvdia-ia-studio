export default function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    online: true,
    uptimeSec: Math.round(process.uptime()),
    runtime: `Node ${process.version} (Vercel serverless)`,
    aiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    marketFeed: 'Yahoo Finance (função serverless)',
    serverTime: new Date().toISOString(),
  });
}
