import React, { useMemo, useState } from 'react';
import { BankrollManagement } from '../types';
import { Calculator, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ManagementTabProps {
  management: BankrollManagement;
  setManagement: React.Dispatch<React.SetStateAction<BankrollManagement>>;
}

export const ManagementTab: React.FC<ManagementTabProps> = ({ management, setManagement }) => {
  const [mgmt, setMgmt] = useState<BankrollManagement>({ ...management });
  const [saved, setSaved] = useState(false);
  // Estimativa do usuário para Kelly/Monte Carlo — NÃO é resultado de backtest.
  const [winRatePct, setWinRatePct] = useState(55);
  const [simSeed, setSimSeed] = useState(0);
  const estimatedWinRate = Math.min(Math.max(winRatePct, 1), 99) / 100;

  // Mathematical Calculations
  const stakeValue = (mgmt.bank * mgmt.riskPct) / 100;
  const breakEvenRate = (100 / (100 + mgmt.pay)) * 100;
  const maxDailyLoss = (mgmt.bank * mgmt.stopPct) / 100;
  const maxTradesBeforeStop = stakeValue > 0 ? Math.floor(maxDailyLoss / stakeValue) : 0;

  // Kelly Criterion
  const b = mgmt.pay / 100;
  const kellyFull = ((estimatedWinRate * (b + 1) - 1) / b) * 100;
  const kellyQuarter = Math.max(0, kellyFull * 0.25);

  const handleSave = () => {
    setManagement(mgmt);
    localStorage.setItem('roxoia_mgmt', JSON.stringify(mgmt));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Monte Carlo Simulation (explicitly random — a stress scenario, not a forecast)
  const simResult = useMemo(() => {
    const sessions = 100;
    const path: number[] = [];
    let currentBank = mgmt.bank;
    let peak = currentBank;
    let maxDrawdown = 0;

    for (let i = 0; i < sessions; i++) {
      let sessionPnl = 0;
      for (let j = 0; j < mgmt.ops; j++) {
        const isWin = Math.random() < estimatedWinRate;
        sessionPnl += isWin ? stakeValue * (mgmt.pay / 100) : -stakeValue;
      }
      currentBank += sessionPnl;
      path.push(currentBank);

      if (currentBank > peak) peak = currentBank;
      const dd = peak - currentBank;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const averageFinal = path.reduce((a, b) => a + b, 0) / sessions;
    const maxDdPct = mgmt.bank > 0 ? (maxDrawdown / mgmt.bank) * 100 : 0;

    return { averageFinal, maxDdPct };
  }, [mgmt.bank, mgmt.ops, mgmt.pay, estimatedWinRate, simSeed]);

  // Soros progression derived from the configured payout (no magic multipliers)
  const sorosLevel2Entry = stakeValue + stakeValue * (mgmt.pay / 100);
  const sorosLevel3Entry = sorosLevel2Entry + sorosLevel2Entry * (mgmt.pay / 100);

  return (
    <div className="space-y-4">
      {/* Top Config Card */}
      <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-violet-500/15">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-fuchsia-400" />
            <span className="font-extrabold text-sm text-violet-100 uppercase tracking-wide">
              Gestão de Risco Quantitativa — Opções Binárias
            </span>
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold shadow-md hover:opacity-90"
          >
            {saved ? 'Salvo!' : 'Salvar Parâmetros'}
          </button>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Saldo da Banca</label>
            <div className="relative">
              <input
                type="number"
                value={mgmt.bank}
                onChange={(e) => setMgmt({ ...mgmt, bank: Number(e.target.value) })}
                className="w-full bg-black/40 border border-violet-500/30 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-violet-400"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Risco / Entrada (%)</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="10"
              value={mgmt.riskPct}
              onChange={(e) => setMgmt({ ...mgmt, riskPct: Number(e.target.value) })}
              className="w-full bg-black/40 border border-violet-500/30 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Payout Médio (%)</label>
            <input
              type="number"
              min="50"
              max="99"
              value={mgmt.pay}
              onChange={(e) => setMgmt({ ...mgmt, pay: Number(e.target.value) })}
              className="w-full bg-black/40 border border-violet-500/30 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Operações / Dia</label>
            <input
              type="number"
              min="1"
              max="30"
              value={mgmt.ops}
              onChange={(e) => setMgmt({ ...mgmt, ops: Number(e.target.value) })}
              className="w-full bg-black/40 border border-violet-500/30 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Stop Loss Diário (%)</label>
            <input
              type="number"
              step="0.5"
              min="1"
              max="20"
              value={mgmt.stopPct}
              onChange={(e) => setMgmt({ ...mgmt, stopPct: Number(e.target.value) })}
              className="w-full bg-black/40 border border-violet-500/30 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Máx. Perdas Seguidas</label>
            <input
              type="number"
              min="1"
              max="5"
              value={mgmt.maxLosses}
              onChange={(e) => setMgmt({ ...mgmt, maxLosses: Number(e.target.value) })}
              className="w-full bg-black/40 border border-violet-500/30 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">
              Acerto Estimado (%)
            </label>
            <input
              type="number"
              step="1"
              min="1"
              max="99"
              value={winRatePct}
              onChange={(e) => setWinRatePct(Number(e.target.value))}
              title="Estimativa informada por você. Não é medida de backtest."
              className="w-full bg-black/40 border border-fuchsia-500/40 rounded-xl px-3 py-2 text-fuchsia-200 font-mono font-bold focus:outline-none focus:border-fuchsia-400"
            />
          </div>
        </div>
        <p className="text-[10px] text-violet-400/70">
          A taxa de acerto acima é uma estimativa sua, usada apenas em Kelly e na simulação Monte Carlo (aleatória).
          Use a aba Backtest para medir o desempenho histórico do setup.
        </p>
      </div>

      {/* Mathematical Calculations Output Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">
            Entrada Fixa Recomendada
          </span>
          <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block tabular-nums">
            R$ {stakeValue.toFixed(2)}
          </span>
          <span className="text-xs text-violet-300/70 mt-1 block">
            Equivale a {mgmt.riskPct}% da banca atual
          </span>
        </div>

        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">
            Break-even Necessário
          </span>
          <span className="text-2xl font-black font-mono text-violet-200 mt-1 block tabular-nums">
            {breakEvenRate.toFixed(1)}%
          </span>
          <span className="text-xs text-violet-300/70 mt-1 block">
            Acerto mínimo para não ter prejuízo com payout de {mgmt.pay}%
          </span>
        </div>

        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">
            Limite Stop Loss Diário
          </span>
          <span className="text-2xl font-black font-mono text-rose-400 mt-1 block tabular-nums">
            -R$ {maxDailyLoss.toFixed(2)}
          </span>
          <span className="text-xs text-violet-300/70 mt-1 block">
            Máximo de {maxTradesBeforeStop} derrotas no dia
          </span>
        </div>

        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">
            Critério de Kelly Seguro (¼ Kelly)
          </span>
          <span className="text-2xl font-black font-mono text-fuchsia-300 mt-1 block tabular-nums">
            {kellyQuarter > 0 ? `${kellyQuarter.toFixed(1)}%` : '0.0%'}
          </span>
          <span className="text-xs text-violet-300/70 mt-1 block">
            Fração ótima calculada para o seu Win Rate estimado
          </span>
        </div>
      </div>

      {/* Monte Carlo & Progression Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monte Carlo Card */}
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-violet-500/15">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="font-extrabold text-xs text-violet-100 uppercase tracking-wide">
              Simulação de Curva de Capital (100 Sessões Monte Carlo)
            </span>
          </div>

          <p className="text-xs text-violet-300/80 leading-relaxed">
            Simulação <b>aleatória</b> (100 sessões) com <b>{mgmt.ops} operações/dia</b>, payout de <b>{mgmt.pay}%</b>,
            entrada de cada sessão em <b>R$ {stakeValue.toFixed(2)}</b> e acerto estimado em{' '}
            <b>{(estimatedWinRate * 100).toFixed(0)}%</b>. Não é previsão de resultado.
          </p>

          <button
            onClick={() => setSimSeed((s) => s + 1)}
            className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-200 hover:bg-violet-500/30 transition-colors"
          >
            Simular novamente
          </button>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="bg-black/30 p-3 rounded-xl border border-violet-500/15">
              <span className="text-[10px] text-violet-400 uppercase font-bold block">Expectativa de Saldo Médio</span>
              <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                R$ {simResult.averageFinal.toFixed(2)}
              </span>
            </div>
            <div className="bg-black/30 p-3 rounded-xl border border-violet-500/15">
              <span className="text-[10px] text-violet-400 uppercase font-bold block">Drawdown Máximo Estimado</span>
              <span className="text-xl font-bold font-mono text-amber-400 tabular-nums">
                {simResult.maxDdPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Soros / Anti-Martingale Progression Card */}
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-violet-500/15">
            <ShieldCheck className="w-4 h-4 text-violet-400" />
            <span className="font-extrabold text-xs text-violet-100 uppercase tracking-wide">
              Tabela de Soros / Alavancagem Saudável (Níveis 1 a 3)
            </span>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="text-[10px] text-violet-400 border-b border-violet-500/20 uppercase font-bold">
                  <th className="py-1.5">Nível</th>
                  <th className="py-1.5">Entrada</th>
                  <th className="py-1.5">Lucro Esperado</th>
                  <th className="py-1.5">Risco Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-500/10">
                <tr>
                  <td className="py-2 text-white font-bold">Mão 1 (Base)</td>
                  <td className="py-2 text-violet-200">R$ {stakeValue.toFixed(2)}</td>
                  <td className="py-2 text-emerald-400">+R$ {(stakeValue * (mgmt.pay / 100)).toFixed(2)}</td>
                  <td className="py-2 text-violet-400">R$ {stakeValue.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-white font-bold">Mão 2 (Soros 1)</td>
                  <td className="py-2 text-violet-200">R$ {sorosLevel2Entry.toFixed(2)}</td>
                  <td className="py-2 text-emerald-400">
                    +R$ {(sorosLevel2Entry * (mgmt.pay / 100)).toFixed(2)}
                  </td>
                  <td className="py-2 text-emerald-400">Lucro do Nível 1</td>
                </tr>
                <tr>
                  <td className="py-2 text-white font-bold">Mão 3 (Soros 2)</td>
                  <td className="py-2 text-violet-200">R$ {sorosLevel3Entry.toFixed(2)}</td>
                  <td className="py-2 text-emerald-400">
                    +R$ {(sorosLevel3Entry * (mgmt.pay / 100)).toFixed(2)}
                  </td>
                  <td className="py-2 text-amber-400">Apenas Lucro</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <b>Regra de Ouro:</b> Nunca utilize Martingale com multiplicações agressivas (2.2x). Prefira Mão Fixa ou
              Soros leve para preservar 100% do seu capital.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
