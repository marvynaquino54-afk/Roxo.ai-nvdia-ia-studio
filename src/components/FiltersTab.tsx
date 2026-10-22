import React, { useState } from 'react';
import { FilterConfig, Candle } from '../types';
import { checkFilters } from '../services/probabilityEngine';
import { Shield, CheckCircle2, XCircle, RotateCcw, Save, Play } from 'lucide-react';

interface FiltersTabProps {
  filters: FilterConfig[];
  setFilters: React.Dispatch<React.SetStateAction<FilterConfig[]>>;
  candles: Candle[];
}

export const FiltersTab: React.FC<FiltersTabProps> = ({ filters, setFilters, candles }) => {
  const [localFilters, setLocalFilters] = useState<FilterConfig[]>([...filters]);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const handleToggle = (id: string) => {
    setLocalFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, on: !f.on } : f))
    );
  };

  const handleUpdate = (id: string, key: 'a' | 'b', val: number) => {
    setLocalFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [key]: val } : f))
    );
  };

  const handleSave = () => {
    setFilters(localFilters);
    localStorage.setItem('roxoia_filters', JSON.stringify(localFilters));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    const defaultFilters: FilterConfig[] = [
      { id: 'f_atr', on: true, a: 0.04, b: 3.5, l: 'Volatilidade (ATR % do preço) dentro da faixa' },
      { id: 'f_adx', on: false, a: 18, b: 65, l: 'ADX (Tendência) dentro da faixa operacional' },
      { id: 'f_rsi', on: true, a: 20, b: 80, l: 'RSI sem exaustão extrema (<20 ou >80)' },
      { id: 'f_body', on: true, a: 0.2, b: 0, l: 'Tamanho mínimo do corpo do candle' },
      { id: 'f_sample', on: false, a: 30, b: 0, l: 'Amostra mínima do backtest histórico' },
    ];
    setLocalFilters(defaultFilters);
    setFilters(defaultFilters);
    localStorage.setItem('roxoia_filters', JSON.stringify(defaultFilters));
  };

  const handleTest = () => {
    if (candles.length === 0) return;
    const res = checkFilters(localFilters, candles, candles.length - 1);
    setTestResult(res);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-violet-500/15 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-violet-400" />
              <span className="font-extrabold text-sm text-violet-100 uppercase tracking-wide">
                Portões de Operação Anti-Ruído
              </span>
            </div>
            <p className="text-xs text-violet-400 mt-0.5">
              Filtros avaliados antes do cálculo da probabilidade. Se reprovarem, o sinal é marcado como FORA DO PERFIL.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="py-1.5 px-3 rounded-lg bg-white/5 border border-violet-500/20 text-xs font-semibold text-violet-300 hover:bg-white/10 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Padrões
            </button>
            <button
              onClick={handleTest}
              className="py-1.5 px-3.5 rounded-lg bg-violet-600/30 border border-violet-500/30 text-xs font-bold text-violet-200 hover:bg-violet-600/50 flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" /> Testar no Gráfico Atual
            </button>
            <button
              onClick={handleSave}
              className="py-1.5 px-4 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold shadow-md hover:opacity-90 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> {saved ? 'Filtros Salvos!' : 'Salvar Filtros'}
            </button>
          </div>
        </div>

        {/* Filters List */}
        <div className="space-y-3">
          {localFilters.map((f) => (
            <div
              key={f.id}
              className={`p-3.5 rounded-xl border transition-all flex flex-wrap items-center justify-between gap-4 ${
                f.on ? 'bg-black/40 border-violet-500/30' : 'bg-black/20 border-violet-500/10 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={f.on}
                  onChange={() => handleToggle(f.id)}
                  className="w-4 h-4 rounded text-violet-600 focus:ring-0 focus:ring-offset-0 bg-black/60 border-violet-500/40 cursor-pointer"
                />
                <span className="font-semibold text-xs text-white">{f.l}</span>
              </div>

              {f.on && (
                <div className="flex items-center gap-3 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-violet-400 uppercase font-bold">Mín:</span>
                    <input
                      type="number"
                      step="any"
                      value={f.a}
                      onChange={(e) => handleUpdate(f.id, 'a', Number(e.target.value))}
                      className="w-16 bg-black/50 border border-violet-500/30 rounded px-2 py-1 text-white font-bold outline-none text-right"
                    />
                  </div>

                  {f.id !== 'f_body' && f.id !== 'f_sample' && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-violet-400 uppercase font-bold">Máx:</span>
                      <input
                        type="number"
                        step="any"
                        value={f.b}
                        onChange={(e) => handleUpdate(f.id, 'b', Number(e.target.value))}
                        className="w-16 bg-black/50 border border-violet-500/30 rounded px-2 py-1 text-white font-bold outline-none text-right"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Live Test Results */}
        {testResult && (
          <div className="mt-4 p-4 rounded-xl bg-black/40 border border-violet-500/25 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between pb-2 border-b border-violet-500/15 text-xs font-bold">
              <span className="text-violet-200">Diagnóstico dos Filtros no Ativo Atual</span>
              <span
                className={`px-2.5 py-0.5 rounded font-mono ${
                  testResult.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {testResult.passed ? 'APROVADO (DENTRO DO PERFIL)' : 'BLOQUEADO (FORA DO PERFIL)'}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              {testResult.items.map((it: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                  <div className="flex items-center gap-2">
                    {it.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="text-violet-200">{it.label}</span>
                  </div>
                  <span className="font-mono text-[11px] text-violet-400">{it.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
