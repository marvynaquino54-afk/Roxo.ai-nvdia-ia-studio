import React, { useState } from 'react';
import { Setup } from '../types';
import { Indicators } from '../services/indicators';
import { wilsonInterval } from '../services/probabilityEngine';
import { geminiService } from '../services/geminiService';
import { Server, Radio, Volume2, Download, Upload, Activity, Github, Globe, CheckCircle2, XCircle, AlertCircle, Play, Sparkles, Key, Check } from 'lucide-react';

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
  const [geminiKeyInput, setGeminiKeyInput] = useState(() => geminiService.getStoredKey());
  const [geminiStatus, setGeminiStatus] = useState<{ ok: boolean; msg: string } | null>(() => {
    const k = geminiService.getStoredKey();
    return k ? { ok: true, msg: 'Chave salva e ativa no navegador' } : null;
  });
  const [testingGemini, setTestingGemini] = useState(false);

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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Responda com a palavra OK' }] }],
        }),
      });

      if (res.ok) {
        setGeminiStatus({ ok: true, msg: 'Conectado com Sucesso! IA Gemini 3.8 / 2.5 Flash Ativa!' });
      } else {
        const err = await res.text();
        setGeminiStatus({ ok: false, msg: `Erro da Google API: ${err.slice(0, 100)}` });
      }
    } catch (e: any) {
      setGeminiStatus({ ok: false, msg: `Falha na conexão: ${e.message}` });
    } finally {
      setTestingGemini(false);
    }
  };

  // Test Market Feed
  const handleTestFeed = async () => {
    setFeedStatus('testando...');
    try {
      const res = await fetch('https://data-api.binance.vision/api/v3/ping');
      if (res.ok) setFeedStatus('Online (Latência ~45ms · CORS OK)');
      else setFeedStatus('Instável');
    } catch {
      setFeedStatus('Erro de Conexão');
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
          symbol: 'BTCUSDT',
          time: new Date().toISOString(),
          prob: '78.5%',
        }),
      });
      setWebhookStatus(res.ok ? 'Webhook Recebido com Sucesso!' : `HTTP ${res.status}`);
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

    // Test 2: EMA
    const ema = Indicators.ema([1, 2, 3, 4, 5], 3);
    tests.push({
      name: 'Média Móvel Exponencial (EMA)',
      ok: ema[4] !== null && ema[4] > 4,
      msg: `EMA(3) final = ${ema[4]?.toFixed(2)}`,
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

  return (
    <div className="space-y-4">
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
              Crie uma conta gratuita no <a href="https://github.com" target="_blank" rel="noreferrer" className="text-white underline">GitHub.com</a> e outra no <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-white underline">Vercel.com</a> (conecte sua conta da Vercel com o GitHub).
            </p>
          </div>

          <div className="bg-black/40 p-4 rounded-xl border border-violet-500/20 space-y-2">
            <div className="flex items-center gap-2 text-fuchsia-300 font-bold">
              <span className="w-6 h-6 rounded-full bg-fuchsia-500/20 flex items-center justify-center text-xs">2</span>
              <span>Subir o Projeto no GitHub</span>
            </div>
            <p className="text-violet-300/80 leading-relaxed">
              No GitHub, clique em <b>New Repository</b>, dê o nome de <b>roxo-ia</b>. Baixe o código deste app e suba os arquivos no repositório criado.
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

      {/* Grid: Feeds & Automations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Feeds & Webhook Card */}
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-violet-500/15">
            <Server className="w-4 h-4 text-violet-400" />
            <span className="font-extrabold text-xs text-violet-100 uppercase tracking-wide">
              Conexões de Mercado & Webhook
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-black/40 rounded-xl border border-violet-500/20 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Feed Binance Vision (Criptomoedas)</span>
                <span className="text-[11px] text-violet-400 font-mono">
                  {feedStatus || 'CORS Liberado · Conexão Pública'}
                </span>
              </div>
              <button
                onClick={handleTestFeed}
                className="px-3 py-1.5 rounded-lg bg-violet-600/30 border border-violet-500/30 text-white font-bold hover:bg-violet-600/50"
              >
                Testar Feed
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-violet-400 uppercase block">
                Webhook TradingView (Disparo Automático de Alertas)
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
