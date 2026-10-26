import React, { useState } from 'react';
import { Setup, SetupRule, Candle } from '../types';
import { runHistoricalBacktest } from '../services/probabilityEngine';
import { cloudStorage } from '../services/firebase';
import { Plus, Copy, Trash2, Cloud, Play, Check, AlertCircle, BarChart3 } from 'lucide-react';

interface SetupsTabProps {
  setups: Setup[];
  setSetups: React.Dispatch<React.SetStateAction<Setup[]>>;
  activeSetup: Setup;
  setActiveSetup: (s: Setup) => void;
  candles: Candle[];
  symbol: string;
  onOpenFullBacktest?: () => void;
}

export const SetupsTab: React.FC<SetupsTabProps> = ({
  setups,
  setSetups,
  activeSetup,
  setActiveSetup,
  candles,
  symbol,
  onOpenFullBacktest,
}) => {
  const [editingSetup, setEditingSetup] = useState<Setup>({ ...activeSetup });
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [cloudSynced, setCloudSynced] = useState(false);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);

  // New rule temp state
  const [newRuleType, setNewRuleType] = useState('ema_cross');
  const [newRuleWeight, setNewRuleWeight] = useState(25);
  const [newRulePol, setNewRulePol] = useState<'pro' | 'contra' | 'neutro'>('pro');

  const handleSelect = (s: Setup) => {
    setActiveSetup(s);
    setEditingSetup({ ...s });
    setBacktestResult(null);
  };

  const handleSaveToCloud = () => {
    const updated = setups.map((s) => (s.id === editingSetup.id ? editingSetup : s));
    setSetups(updated);
    setActiveSetup(editingSetup);
    cloudStorage.saveSetups(updated);
    setCloudSynced(true);
    setTimeout(() => setCloudSynced(false), 2500);
  };

  const handleNewSetup = () => {
    const newId = 's_' + Math.random().toString(36).slice(2, 8);
    const newS: Setup = {
      id: newId,
      name: 'Novo Setup Personalizado',
      dir: 'alta',
      payout: 85,
      rules: [
        { id: 'r_1', type: 'ema_cross', pol: 'pro', weight: 30, params: { fast: 9, slow: 21, dir: 'alta' } },
        { id: 'r_2', type: 'rsi_zone', pol: 'pro', weight: 25, params: { min: 45, max: 70 } },
      ],
    };
    const updated = [...setups, newS];
    setSetups(updated);
    handleSelect(newS);
    cloudStorage.saveSetups(updated);
  };

  const handleDuplicate = () => {
    const newId = 's_' + Math.random().toString(36).slice(2, 8);
    const dup: Setup = {
      ...editingSetup,
      id: newId,
      name: `${editingSetup.name} (Cópia)`,
      rules: editingSetup.rules.map((r) => ({ ...r, id: 'r_' + Math.random().toString(36).slice(2, 7) })),
    };
    const updated = [...setups, dup];
    setSetups(updated);
    handleSelect(dup);
    cloudStorage.saveSetups(updated);
  };

  const handleDelete = () => {
    if (setups.length <= 1) return;
    const updated = setups.filter((s) => s.id !== editingSetup.id);
    setSetups(updated);
    handleSelect(updated[0]);
    cloudStorage.saveSetups(updated);
  };

  const handleRunBacktest = () => {
    if (candles.length < 30) return;
    const res = runHistoricalBacktest(editingSetup, candles);
    setBacktestResult(res);
  };

  const handleAddRule = () => {
    const rId = 'r_' + Math.random().toString(36).slice(2, 7);
    let params: Record<string, any> = {};

    if (newRuleType === 'ema_cross') params = { fast: 9, slow: 21, dir: 'alta' };
    else if (newRuleType === 'sma_cross') params = { fast: 10, slow: 50, dir: 'alta' };
    else if (newRuleType === 'rsi_zone') params = { min: 40, max: 70 };
    else if (newRuleType === 'rsi_level') params = { op: 'menor', val: 35 };
    else if (newRuleType === 'rsi_divergence') params = { dir: 'alta', lookback: 25 };
    else if (newRuleType === 'adx_strength') params = { min: 22 };
    else if (newRuleType === 'macd_hist') params = { op: 'pos' };
    else if (newRuleType === 'bollinger_break') params = { op: 'below' };
    else if (newRuleType === 'bollinger_squeeze') params = { period: 20 };
    else if (newRuleType === 'support_bounce') params = { dir: 'alta', lookback: 30 };
    else if (newRuleType === 'resistance_rejection') params = { dir: 'baixa', lookback: 30 };
    else if (newRuleType === 'pullback_ema') params = { len: 21, dir: 'alta' };
    else if (newRuleType === 'breakout_valid') params = { len: 20, dir: 'alta' };
    else if (newRuleType === 'false_breakout') params = { len: 20, dir: 'alta' };
    else if (newRuleType === 'wick_rejection') params = { minPct: 50, dir: 'alta' };
    else if (newRuleType === 'volume_spike') params = { mult: 1.3 };
    else if (newRuleType === 'candlestick_pattern') params = { pattern: 'Martelo (Hammer)' };
    else if (newRuleType === 'donchian_break') params = { len: 20, dir: 'up' };
    else if (newRuleType === 'ema_price') params = { len: 50, dir: 'acima' };
    else if (newRuleType === 'atr_threshold') params = { op: 'maior', val: 0.1 };

    const rule: SetupRule = {
      id: rId,
      type: newRuleType,
      pol: newRulePol,
      weight: newRuleWeight,
      params,
    };

    setEditingSetup((prev) => ({
      ...prev,
      rules: [...prev.rules, rule],
    }));
    setShowAddRuleModal(false);
  };

  const handleRemoveRule = (rId: string) => {
    setEditingSetup((prev) => ({
      ...prev,
      rules: prev.rules.filter((r) => r.id !== rId),
    }));
  };

  const breakEvenPayout = (100 / (100 + (editingSetup.payout || 85))) * 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Setups List Sidebar (Cols 4) */}
        <div className="lg:col-span-4 bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-violet-500/15 mb-3">
              <span className="font-extrabold text-sm text-violet-100 uppercase tracking-wide">
                Estratégias Salvas ({setups.length})
              </span>
              <button
                onClick={handleNewSetup}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white flex items-center gap-1 hover:opacity-90"
              >
                <Plus className="w-3.5 h-3.5" /> Novo
              </button>
            </div>

            <div className="space-y-2">
              {setups.map((s) => {
                const isSelected = s.id === editingSetup.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelect(s)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-violet-600/20 border-fuchsia-500/50 shadow-[0_0_15px_rgba(168,85,247,0.25)]'
                        : 'bg-black/30 border-violet-500/15 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white truncate max-w-[200px]">{s.name}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          s.dir === 'alta'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : s.dir === 'baixa'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-violet-500/20 text-violet-300'
                        }`}
                      >
                        {s.dir}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-violet-400 mt-1.5 font-mono">
                      <span>{s.rules.length} regras técnicas</span>
                      <span>Payout {s.payout || 85}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-violet-500/15">
            <button
              onClick={handleDuplicate}
              className="flex-1 py-1.5 px-3 rounded-lg bg-white/5 border border-violet-500/20 text-xs font-semibold text-violet-300 hover:bg-white/10 flex items-center justify-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" /> Duplicar
            </button>
            <button
              onClick={handleDelete}
              disabled={setups.length <= 1}
              className="py-1.5 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Setup Editor Form (Cols 8) */}
        <div className="lg:col-span-8 bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-violet-500/15">
            <div>
              <span className="font-extrabold text-sm text-violet-100 uppercase tracking-wide block">
                Editor de Regras & Parâmetros
              </span>
              <span className="text-xs text-violet-400">Personalize indicadores e salve neste navegador</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunBacktest}
                className="px-3.5 py-1.5 rounded-lg bg-violet-600/30 border border-violet-500/30 text-violet-200 text-xs font-bold hover:bg-violet-600/50 flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" /> Prévia Rápida
              </button>
              {onOpenFullBacktest && (
                <button
                  onClick={onOpenFullBacktest}
                  className="px-3.5 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-200 text-xs font-bold hover:bg-violet-600/40 flex items-center gap-1.5"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-fuchsia-400" /> Backtest Pro
                </button>
              )}
              <button
                onClick={handleSaveToCloud}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(168,85,247,0.3)]"
              >
                {cloudSynced ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Cloud className="w-3.5 h-3.5" />}
                {cloudSynced ? 'Setup Salvo!' : 'Salvar Setup'}
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-violet-400 block mb-1">
                Nome do Setup
              </label>
              <input
                type="text"
                value={editingSetup.name}
                onChange={(e) => setEditingSetup({ ...editingSetup, name: e.target.value })}
                className="w-full bg-black/40 border border-violet-500/30 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-violet-400"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-violet-400 block mb-1">
                Direção do Sinal
              </label>
              <select
                value={editingSetup.dir}
                onChange={(e) => setEditingSetup({ ...editingSetup, dir: e.target.value as any })}
                className="w-full bg-black/40 border border-violet-500/30 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-violet-400"
              >
                <option value="alta">Alta / CALL (Compra)</option>
                <option value="baixa">Baixa / PUT (Venda)</option>
                <option value="qualquer">Qualquer Direção</option>
              </select>
            </div>
          </div>

          {/* Rules List */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">
                Regras Técnicas Cadastradas ({editingSetup.rules.length})
              </span>
              <button
                onClick={() => setShowAddRuleModal(true)}
                className="text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Regra
              </button>
            </div>

            <div className="space-y-2">
              {editingSetup.rules.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="bg-black/30 border border-violet-500/20 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-white uppercase">{rule.type.replace('_', ' ')}</span>
                    <span className="text-[11px] text-violet-400 block">
                      Parâmetros: {JSON.stringify(rule.params)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-violet-400 font-bold uppercase">Peso:</span>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rule.weight}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          setEditingSetup((prev) => ({
                            ...prev,
                            rules: prev.rules.map((r, i) => (i === idx ? { ...r, weight: w } : r)),
                          }));
                        }}
                        className="w-12 bg-black/50 border border-violet-500/30 rounded px-1.5 py-0.5 text-center font-mono font-bold text-violet-200 outline-none"
                      />
                    </div>

                    <select
                      value={rule.pol}
                      onChange={(e) => {
                        const pol = e.target.value as any;
                        setEditingSetup((prev) => ({
                          ...prev,
                          rules: prev.rules.map((r, i) => (i === idx ? { ...r, pol } : r)),
                        }));
                      }}
                      className="bg-black/50 border border-violet-500/30 rounded px-2 py-0.5 text-xs text-violet-200 outline-none font-bold"
                    >
                      <option value="pro">PRO (Favorável)</option>
                      <option value="contra">CONTRA (Exaustão)</option>
                      <option value="neutro">NEUTRO (Informativo)</option>
                    </select>

                    <button
                      onClick={() => handleRemoveRule(rule.id)}
                      className="text-violet-400 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Backtest Result Area */}
          {backtestResult && (
            <div className="p-4 rounded-xl bg-violet-950/60 border border-violet-500/30 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between text-xs font-bold text-violet-200 border-b border-violet-500/20 pb-2">
                <span>Resultado do Backtest Histórico ({symbol})</span>
                <span className="text-emerald-400 font-mono">
                  {backtestResult.wins} Vitórias · {backtestResult.losses} Derrotas
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-black/40 p-2 rounded-lg border border-violet-500/15">
                  <span className="text-[10px] text-violet-400 font-bold block">Taxa de Acerto</span>
                  <span className="text-base font-bold font-mono text-emerald-400 tabular-nums">
                    {(backtestResult.winRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="bg-black/40 p-2 rounded-lg border border-violet-500/15">
                  <span className="text-[10px] text-violet-400 font-bold block">Amostra</span>
                  <span className="text-base font-bold font-mono text-white tabular-nums">
                    {backtestResult.n} sinais
                  </span>
                </div>
                <div className="bg-black/40 p-2 rounded-lg border border-violet-500/15">
                  <span className="text-[10px] text-violet-400 font-bold block">Break-even Payout</span>
                  <span className="text-base font-bold font-mono text-violet-300 tabular-nums">
                    {breakEvenPayout.toFixed(1)}%
                  </span>
                </div>
                <div className="bg-black/40 p-2 rounded-lg border border-violet-500/15">
                  <span className="text-[10px] text-violet-400 font-bold block">Expectativa EV</span>
                  <span
                    className={`text-base font-bold font-mono tabular-nums ${
                      backtestResult.ev >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {backtestResult.ev >= 0 ? '+' : ''}
                    {backtestResult.ev}%
                  </span>
                </div>
              </div>

              {onOpenFullBacktest && (
                <div className="pt-1 flex justify-end">
                  <button
                    onClick={onOpenFullBacktest}
                    className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-90 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
                  >
                    <BarChart3 className="w-3.5 h-3.5" /> Abrir Simulação Completa & Curva de Capital ➔
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Rule Modal */}
      {showAddRuleModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#170e33] border border-violet-500/30 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <span className="font-extrabold text-sm text-white uppercase tracking-wide block">
              Adicionar Nova Condição Técnica
            </span>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Tipo de Regra</label>
                <select
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value)}
                  className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-3 py-2 text-white outline-none"
                >
                  <option value="ema_cross">Cruzamento de Médias Exponenciais (EMAs)</option>
                  <option value="sma_cross">Cruzamento de Médias Simples (SMAs)</option>
                  <option value="support_bounce">Suporte Dinâmico com Rejeição (Absorção CALL)</option>
                  <option value="resistance_rejection">Resistência Dinâmica com Rejeição (PUT)</option>
                  <option value="pullback_ema">Reteste / Pullback em Média Móvel (EMA21)</option>
                  <option value="breakout_valid">Rompimento Verdadeiro (Volume + Corpo Sólido)</option>
                  <option value="false_breakout">Falso Rompimento / Armadilha Institucional (Trap)</option>
                  <option value="rsi_divergence">Divergência Regular no RSI(14)</option>
                  <option value="rsi_zone">Faixa Segura de RSI (ex: 40 a 70)</option>
                  <option value="rsi_level">Nível de Exaustão RSI (Sobrevendido / Sobrecomprado)</option>
                  <option value="bollinger_break">Toque ou Rompimento de Bollinger</option>
                  <option value="bollinger_squeeze">Compressão de Volatilidade (Bollinger Squeeze)</option>
                  <option value="adx_strength">Força de Tendência ADX (mínimo 22)</option>
                  <option value="macd_hist">Histograma MACD (Positivo ou Negativo)</option>
                  <option value="wick_rejection">Pavio de Rejeição Extremo (Superior / Inferior)</option>
                  <option value="volume_spike">Volume Elevado (acima da média 20)</option>
                  <option value="candlestick_pattern">Padrão de Vela (Martelo, Engolfo, etc.)</option>
                  <option value="donchian_break">Rompimento de Canal Donchian</option>
                  <option value="ema_price">Preço Acima / Abaixo da Média Móvel</option>
                  <option value="atr_threshold">Filtro de Volatilidade ATR</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Peso (0 a 100)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newRuleWeight}
                    onChange={(e) => setNewRuleWeight(Number(e.target.value))}
                    className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-3 py-2 text-white font-mono font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Polaridade</label>
                  <select
                    value={newRulePol}
                    onChange={(e) => setNewRulePol(e.target.value as any)}
                    className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-3 py-2 text-white outline-none font-bold"
                  >
                    <option value="pro">PRO (Gera Sinal)</option>
                    <option value="contra">CONTRA (Exaustão)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-300 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddRule}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold shadow-md"
              >
                Adicionar ao Setup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
