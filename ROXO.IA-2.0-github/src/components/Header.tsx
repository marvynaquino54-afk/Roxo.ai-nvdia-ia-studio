import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { Shield, Sparkles, User, LogOut, Lock, Search, Keyboard } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  isAiActive: boolean;
  marketFeedStatus: 'unknown' | 'connecting' | 'online' | 'error';
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onOpenAuth,
  onLogout,
  isAiActive,
  marketFeedStatus,
  onOpenPalette,
  onOpenShortcuts,
}) => {
  const [clock, setClock] = useState('--:--:--');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('pt-BR'));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { id: 'analise', label: 'Terminal / Análise' },
    { id: 'setups', label: 'Setups & Regras' },
    { id: 'backtest', label: 'Backtest Pro' },
    { id: 'gestao', label: 'Gestão de Banca' },
    { id: 'filtros', label: 'Filtros Anti-Ruído' },
    { id: 'ia-relatorios', label: 'IA & Diário' },
    { id: 'conexao', label: 'Conexão & Vercel' },
    { id: 'admin', label: 'Painel Admin' },
  ];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0e0822]/90 border-b border-violet-500/20 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        {/* Brand Zone */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center font-black text-white text-lg shadow-[0_0_20px_rgba(168,85,247,0.45)]">
            ◈
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-violet-200 to-fuchsia-400 bg-clip-text text-transparent">
                roxo.ia
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                PRO QUANT
              </span>
            </div>
            <p className="text-[10px] text-violet-300/60 uppercase tracking-widest font-semibold">
              Análise Probabilística & IA
            </p>
          </div>
        </div>

        {/* Live Metrics & Telemetry Chips */}
        <div className="hidden lg:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-violet-500/20 text-violet-200">
            <span className="font-mono tabular-nums font-semibold">{clock}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-violet-500/20 text-violet-200">
            <span
              className={`w-2 h-2 rounded-full ${
                marketFeedStatus === 'online'
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : marketFeedStatus === 'error'
                  ? 'bg-rose-400 shadow-[0_0_8px_#fb7185]'
                  : marketFeedStatus === 'connecting'
                  ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-violet-400">Feed:</span>
            <span className="font-semibold">
              {marketFeedStatus === 'online'
                ? 'Ativo'
                : marketFeedStatus === 'error'
                ? 'Offline'
                : marketFeedStatus === 'connecting'
                ? 'Conectando'
                : 'Aguardando'}
            </span>
          </div>

          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-violet-500/20 text-violet-200"
            title={isAiActive ? 'Chave Gemini configurada neste navegador' : 'Sem chave Gemini local: usando o motor estatístico local'}
          >
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
            <span className="text-violet-400">IA:</span>
            <span className={`font-semibold ${isAiActive ? 'text-fuchsia-300' : 'text-slate-400'}`}>
              {isAiActive ? 'Gemini 2.5' : 'Local'}
            </span>
          </div>
        </div>

        {/* Navigation Tabs (Single-Line Controls) */}
        <nav className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-violet-500/20 overflow-x-auto max-w-full">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_2px_12px_rgba(139,92,246,0.35)]'
                    : 'text-violet-300/70 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.id === 'admin' && <Lock className="w-3 h-3 text-amber-300" />}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User / Auth Area */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenPalette}
            title="Paleta de comandos (Ctrl+K)"
            aria-label="Abrir paleta de comandos"
            className="p-1.5 text-violet-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenShortcuts}
            title="Atalhos de teclado (?)"
            aria-label="Abrir atalhos de teclado"
            className="p-1.5 text-violet-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Keyboard className="w-4 h-4" />
          </button>
          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-violet-950/60 border border-violet-500/30 text-xs">
                {currentUser.role === 'admin' ? (
                  <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <User className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                )}
                <span className="font-semibold truncate max-w-[120px] text-violet-100">
                  {currentUser.displayName}
                </span>
                {currentUser.role === 'admin' && (
                  <span className="text-[9px] uppercase px-1 py-0.2 bg-amber-400/20 text-amber-300 rounded font-bold">
                    DONO
                  </span>
                )}
              </div>
              <button
                onClick={onLogout}
                title="Desconectar"
                className="p-1.5 text-violet-400 hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-95 transition-opacity flex items-center gap-1.5 shadow-[0_2px_10px_rgba(168,85,247,0.3)]"
            >
              <User className="w-3.5 h-3.5" />
              Entrar / Cadastrar
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
