import React, { useState } from 'react';
import { Setup } from '../types';
import { Indicators } from '../services/indicators';
import { wilsonInterval } from '../services/probabilityEngine';
import { geminiService } from '../services/geminiService';
import { universalMarketData, SUPPORTED_PROVIDERS, ProviderConfig } from '../services/marketDataEngine';
import {
  Server,
  Radio,
  Volume2,
  Download,
  Upload,
  Activity,
  Github,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  Sparkles,
  Key,
  Check,
  ShieldCheck,
  Zap,
  Code2,
  Copy,
  ExternalLink,
} from 'lucide-react';

interface ConnectionsTabProps {
  activeSetup: Setup;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
  scanSound: boolean;
  setScanSound: (val: boolean) => void;
}

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  activeSetup,
  isScanning,
  setIsScanning,
  scanSound,
  setScanSound,
}) => {
  const [feedStatus, setFeedStatus] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [diagResults, setDiagResults] = useState<{ name: string; ok: boolean; msg: string }[] | null>(null);

  // Gemini AI key configuration
  const [geminiKeyInput, setGeminiKeyInput] = useState(() => geminiService.getStoredKey());
  const [geminiStatus, setGeminiStatus] = useState<{ ok: boolean; msg: string } | null>(() => {
    const k = geminiService.getStoredKey();
    return k ? { ok: true, msg: 'Chave salva e ativa no navegador' } : null;
  });
  const [testingGemini, setTestingGemini] = useState(false);

  // Universal Providers State
  const [apiKeys, setApiKeys] = useState<{ [key: string]: string }>({
    twelvedata_api_key: universalMarketData.getStoredApiKey('twelvedata_api_key'),
    finnhub_api_key: universalMarketData.getStoredApiKey('finnhub_api_key'),
    alphavantage_api_key: universalMarketData.getStoredApiKey('alphavantage_api_key'),
    polygon_api_key: universalMarketData.getStoredApiKey('polygon_api_key'),
  });
  const [mt5BridgeUrl, setMt5BridgeUrl] = useState(() => localStorage.getItem('roxoia_mt5_bridge_url') || '');
  const [providerTestResults, setProviderTestResults] = useState<{ [id: string]: { ok: boolean; msg: string } }>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [showMt5Script, setShowMt5Script] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const handleSaveApiKey = (keyName: string, value: string) => {
    universalMarketData.setStoredApiKey(keyName, value);
    setApiKeys((prev) => ({ ...prev, [keyName]: value }));
  };

  const handleTestProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    try {
      if (providerId === 'binance') {
        const start = performance.now();
        const res = await fetch('https://data-api.binance.vision/api/v3/ping');
        const lat = Math.round(performance.now() - start);
        if (res.ok) {
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: true, msg: `Online · Latência ${lat}ms (CORS OK)` } }));
        } else {
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: false, msg: `HTTP ${res.status}` } }));
        }
      } else if (providerId === 'yahoo') {
        const start = performance.now();
        const res = await fetch('/api/market/candles?symbol=EURUSD&timeframe=5m&limit=10');
        const lat = Math.round(performance.now() - start);
        if (res.ok) {
          const data = await res.json();
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: true, msg: `Online · Latência ${lat}ms (${data.candles.length} velas reais EUR/USD)` } }));
        } else {
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: false, msg: `Falha no proxy da Yahoo Finance` } }));
        }
      } else if (providerId === 'coingecko') {
        const res = await fetch('https://api.coingecko.com/api/v3/ping');
        if (res.ok) {
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: true, msg: 'API Pública CoinGecko Operacional' } }));
        } else {
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: false, msg: `HTTP ${res.status}` } }));
        }
      } else if (providerId === 'mt5') {
        if (!mt5BridgeUrl) {
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: false, msg: 'Defina a URL da sua ponte MT5 (ex: http://localhost:5000/api/candles)' } }));
          return;
        }
        const res = await fetch(`${mt5BridgeUrl}?symbol=EURUSD&timeframe=5m`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: true, msg: 'Ponte MT5 Local Conectada com Sucesso!' } }));
        } else {
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: false, msg: `Ponte retornou HTTP ${res.status}` } }));
        }
      } else {
        const key = (apiKeys[`${providerId}_api_key`] || '').trim();
        if (!key) {
          setProviderTestResults((p) => ({ ...p, [providerId]: { ok: false, msg: 'Insira sua chave de API para testar.' } }));
          return;
        }

        const signal = AbortSignal.timeout(7000);
        let res: Response;
        let data: any = null;

        if (providerId === 'twelvedata') {
          res = await fetch(
            `https://api.twelvedata.com/price?symbol=EUR/USD&apikey=${encodeURIComponent(key)}`,
            { signal }
          );
          data = await res.json().catch(() => null);
          if (data?.status === 'error' || data?.code) {
            setProviderTestResults((p) => ({
              ...p,
              [providerId]: { ok: false, msg: `Chave recusada: ${data?.message || `HTTP ${res.status}`}` },
            }));
            return;
          }
          const price = data?.price ? Number(data.price) : null;
          setProviderTestResults((p) => ({
            ...p,
            [providerId]: {
              ok: res.ok,
              msg: res.ok
                ? `Chave válida · EUR/USD ${price ? price.toFixed(5) : 'cotação recebida'}`
                : `HTTP ${res.status}`,
            },
          }));
          return;
        }

        if (providerId === 'finnhub') {
          res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=OANDA:EUR_USD&token=${encodeURIComponent(key)}`,
            { signal }
          );
          data = await res.json().catch(() => null);
          if (!res.ok || data?.error) {
            const msg = data?.error || `HTTP ${res.status}`;
            const invalid = res.status === 401 || res.status === 403;
            setProviderTestResults((p) => ({
              ...p,
              [providerId]: {
                ok: false,
                msg: invalid ? `Chave recusada: ${msg}` : `Falha na validação: ${msg}`,
              },
            }));
            return;
          }
          setProviderTestResults((p) => ({
            ...p,
            [providerId]: { ok: true, msg: 'Chave aceita pela API Finnhub' },
          }));
          return;
        }

        if (providerId === 'alphavantage') {
          res = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=${encodeURIComponent(key)}`,
            { signal }
          );
          data = await res.json().catch(() => null);
          if (data?.['Error Message']) {
            setProviderTestResults((p) => ({
              ...p,
              [providerId]: { ok: false, msg: `Chave recusada: ${data['Error Message']}` },
            }));
            return;
          }
          if (data?.Information || data?.Note) {
            setProviderTestResults((p) => ({
              ...p,
              [providerId]: {
                ok: false,
                msg: 'Chave salva, mas o limite gratuito de chamadas foi atingido. Tente novamente mais tarde.',
              },
            }));
            return;
          }
          setProviderTestResults((p) => ({
            ...p,
            [providerId]: {
              ok: Boolean(data?.['Global Quote']),
              msg: data?.['Global Quote']
                ? 'Chave válida · cotação IBM recebida'
                : `Resposta inesperada (HTTP ${res.status})`,
            },
          }));
          return;
        }

        if (providerId === 'polygon') {
          res = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${encodeURIComponent(key)}`,
            { signal }
          );
          data = await res.json().catch(() => null);
          if (!res.ok || data?.status === 'ERROR' || data?.error) {
            const msg = data?.error || data?.message || `HTTP ${res.status}`;
            setProviderTestResults((p) => ({
              ...p,
              [providerId]: { ok: false, msg: `Chave recusada ou sem permissão: ${msg}` },
            }));
            return;
          }
          setProviderTestResults((p) => ({
            ...p,
            [providerId]: { ok: true, msg: 'Chave aceita pela API Polygon.io' },
          }));
          return;
        }

        setProviderTestResults((p) => ({
          ...p,
          [providerId]: { ok: false, msg: 'Provedor sem teste automático configurado.' },
        }));
      }
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      setProviderTestResults((p) => ({
        ...p,
        [providerId]: {
          ok: false,
          msg: timedOut
            ? 'Tempo esgotado ao validar. A chave continua salva neste navegador, mas não foi validada.'
            : `Não foi possível validar agora (${err.message}). A chave continua salva no navegador.`,
        },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveAndTestGemini = async () => {
    const key = geminiKeyInput.trim();
    if (!key) {
      geminiService.setStoredKey('');
      setGeminiStatus({ ok: false, msg: 'Chave removida. O app usará o motor estatístico local.' });
      return;
    }
    setTestingGemini(true);
    setGeminiStatus(null);
    geminiService.setStoredKey(key);

    try {
      // Test through server endpoint with the provided key
      const res = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': key,
        },
        body: JSON.stringify({
          symbol: 'EURUSD',
          timeframe: '5m',
          probability: 65,
          score: 80,
          ev: 12,
          payout: 85,
          setupName: 'Teste de Conexão',
          rulesStatus: 'Auditoria de Conexão',
          role: 'analista',
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (res.ok) {
        const data = await res.json();
        const latency = data.executionTimeMs ? ` (${data.executionTimeMs}ms)` : '';
        setGeminiStatus({
          ok: true,
          msg: `Conectado com Sucesso! IA ${data.modelUsed || 'Gemini 3.6 Flash'}${latency} Operacional!`,
        });
      } else {
        // Fallback test
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(key)}`;
        const directRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Responda com a palavra OK' }] }],
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (directRes.ok) {
          setGeminiStatus({ ok: true, msg: 'Conectado com Sucesso! IA Gemini Flash Ativa!' });
        } else {
          const err = await directRes.text();
          setGeminiStatus({ ok: false, msg: `Erro da Google API: ${err.slice(0, 100)}` });
        }
      }
    } catch (e: any) {
      setGeminiStatus({ ok: false, msg: `Falha na conexão: ${e.message}` });
    } finally {
      setTestingGemini(false);
    }
  };

  // Test Webhook
  const handleTestWebhook = async () => {
    if (!webhookUrl) return;
    setWebhookStatus('enviando...');
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'TESTE_ROXO_IA',
          message: 'Teste de webhook do ROXO.IA',
          time: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      });
      setWebhookStatus(
        res.ok
          ? 'Servidor respondeu HTTP 200 (não é possível confirmar o recebimento pelo destino).'
          : `Resposta HTTP ${res.status}`
      );
    } catch (e: any) {
      setWebhookStatus(`Falha: ${e.message}`);
    }
  };

  // Run Self-Diagnostic battery
  const runSelfDiagnostics = () => {
    const tests: { name: string; ok: boolean; msg: string }[] = [];

    // Test 1: Math functions
    const sma = Indicators.sma([1, 2, 3, 4, 5], 3);
    tests.push({
      name: 'Média Móvel Simples (SMA)',
      ok: sma[4] === 4,
      msg: `SMA(3) de [1..5] = ${sma[4]} (esperado 4.0)`,
    });

    // Test 2: EMA (seeded by SMA, so a linear ramp yields exactly the last price)
    const ema = Indicators.ema([1, 2, 3, 4, 5], 3);
    tests.push({
      name: 'Média Móvel Exponencial (EMA)',
      ok: ema[4] !== null && Math.abs((ema[4] as number) - 4) < 1e-9,
      msg: `EMA(3) final = ${ema[4]?.toFixed(2)} (esperado 4.00)`,
    });

    // Test 3: RSI Range
    const upPrices = Array.from({ length: 40 }, (_, i) => 100 + i);
    const rsiUp = Indicators.rsi(upPrices, 14)[39];
    tests.push({
      name: 'RSI em Tendência de Alta',
      ok: rsiUp !== null && rsiUp > 70,
      msg: `RSI = ${rsiUp?.toFixed(1)} (esperado > 70)`,
    });

    // Test 4: Wilson Interval
    const ci = wilsonInterval(50, 100);
    tests.push({
      name: 'Intervalo de Confiança Wilson 95%',
      ok: ci[0] < 0.5 && ci[1] > 0.5,
      msg: `IC 95%: ${(ci[0] * 100).toFixed(1)}% a ${(ci[1] * 100).toFixed(1)}%`,
    });

    // Test 5: Storage
    try {
      localStorage.setItem('__test', '1');
      const ok = localStorage.getItem('__test') === '1';
      localStorage.removeItem('__test');
      tests.push({ name: 'Persistência no Navegador', ok, msg: 'Leitura e escrita OK' });
    } catch {
      tests.push({ name: 'Persistência no Navegador', ok: false, msg: 'Bloqueado' });
    }

    setDiagResults(tests);
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    const data = {
      setups: localStorage.getItem('roxoia_cloud_setups'),
      filters: localStorage.getItem('roxoia_filters'),
      mgmt: localStorage.getItem('roxoia_mgmt'),
      apiKeys: localStorage.getItem('roxoia_api_keys'),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roxoia-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const mt5PythonCode = `# ==============================================================
# Ponte Local MetaTrader 5 (MT5) -> roxo.ia Terminal
# Como rodar no seu computador:
# 1. Abra o CMD ou terminal e instale: pip install MetaTrader5 flask flask-cors
# 2. Deixe o MetaTrader 5 aberto na sua conta de corretora
# 3. Execute: python mt5_bridge.py
# 4. Pronto! O roxo.ia vai puxar as velas direto da sua corretora em tempo real!
# ==============================================================
import MetaTrader5 as mt5
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

if not mt5.initialize():
    print("Falha ao inicializar MT5:", mt5.last_error())
    quit()

TF_MAP = {
    '1m': mt5.TIMEFRAME_M1,
    '5m': mt5.TIMEFRAME_M5,
    '15m': mt5.TIMEFRAME_M15,
    '30m': mt5.TIMEFRAME_M30,
    '1h': mt5.TIMEFRAME_H1,
    '4h': mt5.TIMEFRAME_H4,
    '1d': mt5.TIMEFRAME_D1,
}

@app.route('/api/candles')
def get_candles():
    symbol = request.args.get('symbol', 'EURUSD').upper()
    tf_str = request.args.get('timeframe', '5m')
    limit = int(request.args.get('limit', 160))
    timeframe = TF_MAP.get(tf_str, mt5.TIMEFRAME_M5)

    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, limit)
    if rates is None or len(rates) == 0:
        return jsonify({'error': 'Ativo nao encontrado no MT5', 'candles': []}), 404

    candles = []
    for r in rates:
        candles.append({
            't': int(r['time']) * 1000,
            'o': float(r['open']),
            'h': float(r['high']),
            'l': float(r['low']),
            'c': float(r['close']),
            'v': int(r['tick_volume'])
        })

    return jsonify({
        'symbol': symbol,
        'timeframe': tf_str,
        'source': 'mt5_bridge',
        'candles': candles
    })

if __name__ == '__main__':
    print("Ponte MT5 roxo.ia rodando em http://localhost:5000/api/candles")
    app.run(port=5000)
`;

  return (
    <div className="space-y-4">
      {/* Universal Market Data Hub Banner */}
      <div className="bg-gradient-to-r from-violet-950/80 via-[#150b2e] to-black/80 border border-violet-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-violet-500/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white tracking-wide">
                  Central Universal de Provedores de Mercado (8 Provedores)
                </h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold px-2 py-0.5 rounded">
                  100% REAL
                </span>
              </div>
              <p className="text-xs text-violet-300/80 mt-0.5">
                Alterne entre feeds ao vivo de Cripto, Forex e Ações. O terminal bloqueia automaticamente sinais caso dados reais não estejam disponíveis.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMt5Script(!showMt5Script)}
              className="py-2 px-3 rounded-xl bg-violet-600/30 border border-violet-500/30 text-white font-bold text-xs hover:bg-violet-600/50 flex items-center gap-1.5 transition-all"
            >
              <Code2 className="w-4 h-4 text-fuchsia-400" />
              <span>{showMt5Script ? 'Ocultar Script MT5' : 'Ver Script Ponte MT5 (1 Clique)'}</span>
            </button>
          </div>
        </div>

        {/* Modal / Card for MT5 Python Script */}
        {showMt5Script && (
          <div className="bg-black/60 p-4 rounded-xl border border-violet-500/30 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-fuchsia-400" /> Script Python para MetaTrader 5 Bridge
                </span>
                <p className="text-xs text-violet-300/80">
                  Rode este script no seu computador para enviar velas em tempo real direto da sua corretora para o roxo.ia!
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(mt5PythonCode);
                  setCopiedScript(true);
                  setTimeout(() => setCopiedScript(false), 2000);
                }}
                className="py-1.5 px-3 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs flex items-center gap-1"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? 'Copiado!' : 'Copiar Código'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-black/80 text-[11px] font-mono text-violet-200 overflow-x-auto max-h-60 border border-violet-500/20">
              {mt5PythonCode}
            </pre>
            <div className="flex items-center gap-2 pt-1">
              <label className="text-[10px] font-bold text-violet-400 uppercase">
                URL da sua Ponte MT5 Local:
              </label>
              <input
                type="text"
                placeholder="http://localhost:5000/api/candles"
                value={mt5BridgeUrl}
                onChange={(e) => {
                  setMt5BridgeUrl(e.target.value);
                  localStorage.setItem('roxoia_mt5_bridge_url', e.target.value);
                }}
                className="flex-1 bg-black/50 border border-violet-500/30 rounded-lg px-2.5 py-1 text-xs text-white font-mono outline-none"
              />
            </div>
          </div>
        )}

        {/* Providers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {SUPPORTED_PROVIDERS.map((prov) => {
            const testRes = providerTestResults[prov.id];
            const isTesting = testingProvider === prov.id;
            const keyName = prov.keyName;
            const currentKeyValue = keyName ? apiKeys[keyName] || '' : '';

            return (
              <div
                key={prov.id}
                className="bg-black/40 border border-violet-500/20 rounded-xl p-3.5 flex flex-col justify-between space-y-3 hover:border-violet-500/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-violet-500/15">
                    <span className="font-extrabold text-white text-xs truncate max-w-[150px]">
                      {prov.name}
                    </span>
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded border ${
                        prov.requiresKey && !currentKeyValue
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                      }`}
                    >
                      {prov.requiresKey && !currentKeyValue ? 'CHAVE OPCIONAL' : 'ATIVO'}
                    </span>
                  </div>
                  <p className="text-[11px] text-violet-300/70 mt-2 leading-relaxed">
                    {prov.description}
                  </p>
                </div>

                {prov.requiresKey && keyName && (
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-violet-400 uppercase">Sua Chave de API:</label>
                    <input
                      type="password"
                      placeholder="Cole sua chave aqui..."
                      value={currentKeyValue}
                      onChange={(e) => handleSaveApiKey(keyName, e.target.value)}
                      className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1 text-[11px] text-white font-mono outline-none focus:border-violet-400"
                    />
                  </div>
                )}

                <div className="pt-2 border-t border-violet-500/15 flex items-center justify-between gap-2">
                  <a
                    href={prov.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-violet-400 hover:text-white flex items-center gap-1 font-semibold"
                  >
                    Site <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <button
                    onClick={() => handleTestProvider(prov.id)}
                    disabled={isTesting}
                    className="px-2.5 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 text-white font-bold text-[10px] border border-violet-500/30 transition-all disabled:opacity-50"
                  >
                    {isTesting ? 'Testando...' : 'Testar Conexão'}
                  </button>
                </div>

                {testRes && (
                  <div
                    className={`p-2 rounded-lg text-[10px] flex items-center gap-1.5 ${
                      testRes.ok
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {testRes.ok ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{testRes.msg}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Beginner Step-by-Step Guide for GitHub & Vercel */}
      <div className="bg-gradient-to-r from-violet-950/70 via-black/80 to-[#140b2e] border border-violet-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-violet-500/20">
          <div className="w-10 h-10 rounded-xl bg-violet-600/30 border border-violet-500/30 flex items-center justify-center text-white">
            <Globe className="w-5 h-5 text-fuchsia-400" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wide">
              Como Hospedar Grátis na Vercel e GitHub (Passo a Passo para Iniciantes)
            </h3>
            <p className="text-xs text-violet-300/80">
              Siga estas instruções simples para ter a ferramenta online 24h e acessível de qualquer celular ou computador sem gastar nada.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-black/40 p-4 rounded-xl border border-violet-500/20 space-y-2">
            <div className="flex items-center gap-2 text-fuchsia-300 font-bold">
              <span className="w-6 h-6 rounded-full bg-fuchsia-500/20 flex items-center justify-center text-xs">1</span>
              <span>Criar Contas Gratuitas</span>
            </div>
            <p className="text-violet-300/80 leading-relaxed">
              Crie uma conta gratuita no{' '}
              <a href="https://github.com" target="_blank" rel="noreferrer" className="text-white underline">
                GitHub.com
              </a>{' '}
              e outra no{' '}
              <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-white underline">
                Vercel.com
              </a>{' '}
              (conecte sua conta da Vercel com o GitHub).
            </p>
          </div>

          <div className="bg-black/40 p-4 rounded-xl border border-violet-500/20 space-y-2">
            <div className="flex items-center gap-2 text-fuchsia-300 font-bold">
              <span className="w-6 h-6 rounded-full bg-fuchsia-500/20 flex items-center justify-center text-xs">2</span>
              <span>Subir o Projeto no GitHub</span>
            </div>
            <p className="text-violet-300/80 leading-relaxed">
              No GitHub, clique em <b>New Repository</b>, dê o nome de <b>roxo-ia</b>. Baixe o código deste app pelo botão abaixo e suba os arquivos no repositório criado.
            </p>
          </div>

          <div className="bg-black/40 p-4 rounded-xl border border-violet-500/20 space-y-2">
            <div className="flex items-center gap-2 text-fuchsia-300 font-bold">
              <span className="w-6 h-6 rounded-full bg-fuchsia-500/20 flex items-center justify-center text-xs">3</span>
              <span>Publicar na Vercel com 1 Clique</span>
            </div>
            <p className="text-violet-300/80 leading-relaxed">
              No painel da Vercel, clique em <b>Add New → Project</b>, selecione seu repositório <b>roxo-ia</b> e clique em <b>Deploy</b>. Seu app estará online com HTTPS gratuito!
            </p>
          </div>
        </div>
      </div>

      {/* Gemini AI Key Configuration Banner */}
      <div className="bg-gradient-to-r from-violet-900/60 via-fuchsia-950/50 to-black/70 border border-fuchsia-500/30 rounded-2xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-violet-500/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 flex items-center justify-center text-fuchsia-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-white uppercase tracking-wide block">
                Conectar Inteligência Artificial (Google Gemini)
              </span>
              <span className="text-xs text-violet-300/80">
                Ative a IA para obter confluências na próxima vela, conselhos de volatilidade e relatórios automáticos.
              </span>
            </div>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-fuchsia-300 hover:text-white underline font-semibold flex items-center gap-1"
          >
            Obter chave gratuita no Google AI Studio ↗
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[280px]">
            <Key className="w-4 h-4 text-violet-400 absolute left-3 top-2.5" />
            <input
              type="password"
              placeholder="Cole sua chave aqui (AIzaSy...)"
              value={geminiKeyInput}
              onChange={(e) => setGeminiKeyInput(e.target.value)}
              className="w-full bg-black/60 border border-violet-500/30 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white outline-none focus:border-fuchsia-400"
            />
          </div>
          <button
            onClick={handleSaveAndTestGemini}
            disabled={testingGemini}
            className="py-2 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-95 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{testingGemini ? 'Testando Conexão...' : 'Salvar & Ativar IA'}</span>
          </button>
        </div>

        {geminiStatus && (
          <div
            className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
              geminiStatus.ok
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            {geminiStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            <span className="font-semibold">{geminiStatus.msg}</span>
          </div>
        )}
      </div>

      {/* Grid: Webhook, Backups and Background Scanner */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Webhook & Backups */}
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-violet-500/15">
            <Radio className="w-4 h-4 text-violet-400" />
            <span className="font-extrabold text-xs text-violet-100 uppercase tracking-wide">
              Disparador de Webhooks & Alertas
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-violet-400 uppercase block">
                Webhook TradingView / Telegram / Discord (Disparo Automático de Alertas)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="https://seu-servidor.com/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="flex-1 bg-black/40 border border-violet-500/30 rounded-xl px-3 py-2 text-white font-mono text-xs outline-none"
                />
                <button
                  onClick={handleTestWebhook}
                  className="px-3 py-2 rounded-xl bg-violet-600/30 border border-violet-500/30 text-white font-bold hover:bg-violet-600/50"
                >
                  Testar
                </button>
              </div>
              {webhookStatus && <span className="text-[11px] font-mono text-violet-300 block">{webhookStatus}</span>}
            </div>
          </div>

          {/* Backup & Restore & Download Project */}
          <div className="pt-3 border-t border-violet-500/15 flex flex-wrap items-center gap-2">
            <a
              href="/roxo-ia-completo.zip"
              download="roxo-ia-completo.zip"
              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md hover:opacity-95"
            >
              <Download className="w-3.5 h-3.5" /> Baixar Projeto (.ZIP para PC)
            </a>
            <button
              onClick={handleExportBackup}
              className="py-2 px-3 rounded-xl bg-white/5 border border-violet-500/20 text-xs font-semibold text-violet-200 hover:bg-white/10 flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Backup Dados JSON
            </button>
          </div>
        </div>

        {/* Background Scanner & Self-Diagnostic */}
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-violet-500/15">
            <Activity className="w-4 h-4 text-fuchsia-400" />
            <span className="font-extrabold text-xs text-violet-100 uppercase tracking-wide">
              Varredura Automática & Autodiagnóstico
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-black/40 border border-violet-500/20 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Varredura de Oportunidades em Segundo Plano</span>
                <span className="text-[11px] text-violet-400">
                  Monitora pares de Forex e Cripto e dispara alerta quando a probabilidade for alta.
                </span>
              </div>
              <input
                type="checkbox"
                checked={isScanning}
                onChange={(e) => setIsScanning(e.target.checked)}
                className="w-4 h-4 rounded text-violet-600 bg-black/60 border-violet-500/40 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-violet-500/15">
              <span className="text-violet-300">Alerta Sonoro (Beep de entrada)</span>
              <input
                type="checkbox"
                checked={scanSound}
                onChange={(e) => setScanSound(e.target.checked)}
                className="w-4 h-4 rounded text-violet-600 bg-black/60 border-violet-500/40 cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">
                Bateria de Autodiagnóstico do Motor Quant
              </span>
              <button
                onClick={runSelfDiagnostics}
                className="px-3 py-1 rounded-lg bg-violet-600/30 border border-violet-500/30 text-xs font-bold text-violet-200 hover:bg-violet-600/50 flex items-center gap-1"
              >
                <Play className="w-3 h-3 text-emerald-400" /> Executar Testes
              </button>
            </div>

            {diagResults && (
              <div className="space-y-1.5 p-3 rounded-xl bg-black/30 border border-violet-500/20 text-xs animate-fadeIn">
                {diagResults.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {t.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      <span className="text-violet-200">{t.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-violet-400">{t.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
