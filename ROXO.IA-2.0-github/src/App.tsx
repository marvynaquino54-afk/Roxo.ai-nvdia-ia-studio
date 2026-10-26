import React, { useState, useEffect, useRef } from 'react';
import { Setup, FilterConfig, BankrollManagement, Candle, MarketType, UserProfile, OpportunityAlert } from './types';
import { authService, cloudStorage } from './services/firebase';
import { DEFAULT_SETUPS, DEFAULT_FILTERS, evaluateSetupProbabilities } from './services/probabilityEngine';
import { fetchMarketCandles } from './services/marketApi';
import { Header } from './components/Header';
import { AnalysisTab } from './components/AnalysisTab';
import { SetupsTab } from './components/SetupsTab';
import { BacktestTab } from './components/BacktestTab';
import { ManagementTab } from './components/ManagementTab';
import { FiltersTab } from './components/FiltersTab';
import { AIReportsTab } from './components/AIReportsTab';
import { ConnectionsTab } from './components/ConnectionsTab';
import { AdminTab } from './components/AdminTab';
import { AuthModal } from './components/AuthModal';
import { CameraModal } from './components/CameraModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { CommandPaletteModal, PaletteCommand } from './components/CommandPaletteModal';
import { geminiService } from './services/geminiService';
import {
  Camera,
  Monitor,
  Upload,
  Bell,
  Activity,
  FlaskConical,
  BarChart3,
  Wallet,
  Filter,
  Sparkles,
  Plug,
  Lock,
  Keyboard,
  CircleStop,
  User,
  LogOut,
} from 'lucide-react';

const TAB_ITEMS = [
  { id: 'analise', label: 'Terminal / Análise', icon: <Activity className="w-3 h-3" /> },
  { id: 'setups', label: 'Setups & Regras', icon: <FlaskConical className="w-3 h-3" /> },
  { id: 'backtest', label: 'Backtest Pro', icon: <BarChart3 className="w-3 h-3" /> },
  { id: 'gestao', label: 'Gestão de Banca', icon: <Wallet className="w-3 h-3" /> },
  { id: 'filtros', label: 'Filtros Anti-Ruído', icon: <Filter className="w-3 h-3" /> },
  { id: 'ia-relatorios', label: 'IA & Diário', icon: <Sparkles className="w-3 h-3" /> },
  { id: 'conexao', label: 'Conexão & Vercel', icon: <Plug className="w-3 h-3" /> },
  { id: 'admin', label: 'Painel Admin', icon: <Lock className="w-3 h-3" /> },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('analise');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraInitialMode, setCameraInitialMode] = useState<'upload' | 'camera' | 'screen'>('upload');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Core Data States
  const [setups, setSetups] = useState<Setup[]>(() => {
    const cloud = cloudStorage.getSetups();
    return cloud && cloud.length > 0 ? cloud : DEFAULT_SETUPS;
  });
  const [activeSetup, setActiveSetup] = useState<Setup>(setups[0]);

  const [filters, setFilters] = useState<FilterConfig[]>(() => {
    try {
      const saved = localStorage.getItem('roxoia_filters');
      return saved ? JSON.parse(saved) : DEFAULT_FILTERS;
    } catch {
      return DEFAULT_FILTERS;
    }
  });

  const [management, setManagement] = useState<BankrollManagement>(() => {
    try {
      const saved = localStorage.getItem('roxoia_mgmt');
      return saved
        ? JSON.parse(saved)
        : { bank: 1000, riskPct: 2, pay: 85, ops: 5, stopPct: 6, maxLosses: 3 };
    } catch {
      return { bank: 1000, riskPct: 2, pay: 85, ops: 5, stopPct: 6, maxLosses: 3 };
    }
  });

  // Active Market & Candles State
  const [candles, setCandles] = useState<Candle[]>([]);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [marketType, setMarketType] = useState<MarketType>('crypto');
  const [marketFeedStatus, setMarketFeedStatus] = useState<'unknown' | 'connecting' | 'online' | 'error'>('unknown');
  const [isAiActive, setIsAiActive] = useState(() => Boolean(geminiService.getStoredKey()));

  // Background Scanner States
  const [isScanning, setIsScanning] = useState(false);
  const [scanSound, setScanSound] = useState(true);
  const [latestAlert, setLatestAlert] = useState<OpportunityAlert | null>(null);

  // Audio Context for Beep
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playAlertBeep = () => {
    if (!scanSound) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.38);
    } catch (e) {
      console.warn('Audio context blocked', e);
    }
  };

  // Auth state listener
  useEffect(() => {
    const unsub = authService.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return unsub;
  }, []);

  // Keep the AI status chip truthful: it reflects a configured key, nothing else.
  useEffect(() => {
    const sync = () => setIsAiActive(Boolean(geminiService.getStoredKey()));
    window.addEventListener('roxoia:keychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('roxoia:keychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  // Global keyboard shortcuts (see ShortcutsModal for the documented list)
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setShortcutsOpen(false);
        setCameraModalOpen(false);
        setAuthModalOpen(false);
        return;
      }

      const anyModalOpen = paletteOpen || shortcutsOpen || cameraModalOpen || authModalOpen;
      if (anyModalOpen || isEditable(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (e.altKey && /^[1-8]$/.test(e.key)) {
        e.preventDefault();
        const tab = TAB_ITEMS[Number(e.key) - 1];
        if (tab) setActiveTab(tab.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen, shortcutsOpen, cameraModalOpen, authModalOpen]);

  // Background Opportunity Scanner Loop
  useEffect(() => {
    if (!isScanning) return;

    const candidateSymbols = ['BTCUSDT', 'ETHUSDT', 'EURUSD', 'GBPUSD', 'AAPL'];
    let idx = 0;

    const interval = setInterval(async () => {
      const sym = candidateSymbols[idx % candidateSymbols.length];
      idx++;

      try {
        const testCandles = await fetchMarketCandles(sym, timeframe, 100);
        if (testCandles.length > 20) {
          const evalRes = evaluateSetupProbabilities(activeSetup, testCandles, testCandles.length - 1);
          const prob = Math.round(evalRes.prob * 100);

          if (prob >= 64 || prob <= 36) {
            const alertItem: OpportunityAlert = {
              id: 'alt_' + Date.now(),
              symbol: sym,
              tf: timeframe,
              prob,
              conf: evalRes.conf,
              setup: activeSetup.name,
              direction: prob >= 50 ? 'CALL' : 'PUT',
              time: new Date().toLocaleTimeString('pt-BR'),
              payout: activeSetup.payout || 85,
              ev: evalRes.ev,
            };
            setLatestAlert(alertItem);
            playAlertBeep();
          }
        }
      } catch (err) {
        console.warn(`Varredura: falha ao consultar ${sym}`, err);
      }
    }, 18000);

    return () => clearInterval(interval);
  }, [isScanning, activeSetup, timeframe, scanSound]);

  const openCamera = (mode: 'upload' | 'camera' | 'screen') => {
    setCameraInitialMode(mode);
    setCameraModalOpen(true);
  };

  const commandList: PaletteCommand[] = [
    ...TAB_ITEMS.map((tab) => ({
      id: `tab_${tab.id}`,
      title: `Ir para ${tab.label}`,
      subtitle: 'Trocar de aba',
      group: 'Navegação',
      icon: tab.icon,
      perform: () => setActiveTab(tab.id),
    })),
    {
      id: 'capture_upload',
      title: 'Enviar print de gráfico',
      subtitle: 'Upload, arrastar ou colar imagem',
      group: 'Ações',
      icon: <Upload className="w-3 h-3" />,
      perform: () => openCamera('upload'),
    },
    {
      id: 'capture_camera',
      title: 'Abrir câmera',
      subtitle: 'Capturar gráfico pela câmera',
      group: 'Ações',
      icon: <Camera className="w-3 h-3" />,
      perform: () => openCamera('camera'),
    },
    {
      id: 'capture_screen',
      title: 'Gravar tela',
      subtitle: 'Capturar a tela do computador',
      group: 'Ações',
      icon: <Monitor className="w-3 h-3" />,
      perform: () => openCamera('screen'),
    },
    {
      id: 'scanner_toggle',
      title: isScanning ? 'Parar varredura de oportunidades' : 'Iniciar varredura de oportunidades',
      subtitle: 'Consulta ativos a cada 18 segundos',
      group: 'Ações',
      icon: <CircleStop className="w-3 h-3" />,
      perform: () => setIsScanning((v) => !v),
    },
    {
      id: 'sound_toggle',
      title: scanSound ? 'Desativar som de alerta' : 'Ativar som de alerta',
      group: 'Ações',
      icon: <Bell className="w-3 h-3" />,
      perform: () => setScanSound((v) => !v),
    },
    {
      id: 'shortcuts',
      title: 'Ver atalhos de teclado',
      group: 'Ajuda',
      icon: <Keyboard className="w-3 h-3" />,
      perform: () => setShortcutsOpen(true),
    },
    currentUser
      ? {
          id: 'logout',
          title: 'Sair da conta',
          subtitle: currentUser.displayName,
          group: 'Conta',
          icon: <LogOut className="w-3 h-3" />,
          perform: () => authService.logout(),
        }
      : {
          id: 'login',
          title: 'Entrar / Cadastrar',
          group: 'Conta',
          icon: <User className="w-3 h-3" />,
          perform: () => setAuthModalOpen(true),
        },
  ];

  const handleCandlesDetected = (newCandles: Candle[]) => {
    setCandles(newCandles);
    setMarketType('image');
    setActiveTab('analise');
  };

  const handleApplyDetectedChart = async (data: {
    symbol: string;
    timeframe: string;
    candles: Candle[];
    visionReport: any;
  }) => {
    setSymbol(data.symbol);
    setTimeframe(data.timeframe);

    // Determine market type based on symbol
    const cleanSym = data.symbol.toUpperCase();
    if (cleanSym.endsWith('USDT') || cleanSym.endsWith('BTC') || cleanSym.startsWith('BTC') || cleanSym.startsWith('ETH')) {
      setMarketType('crypto');
    } else if (cleanSym.length === 6 && (cleanSym.startsWith('EUR') || cleanSym.startsWith('GBP') || cleanSym.startsWith('USD') || cleanSym.startsWith('AUD'))) {
      setMarketType('forex');
    } else {
      setMarketType('equities');
    }

    if (data.candles && data.candles.length >= 10) {
      setCandles(data.candles);
    } else {
      try {
        const fresh = await fetchMarketCandles(data.symbol, data.timeframe, 120);
        if (fresh.length > 0) {
          setCandles(fresh);
        }
      } catch (err) {
        console.warn('Erro ao atualizar velas pós-OCR:', err);
      }
    }

    setActiveTab('analise');
  };

  return (
    <div className="min-h-screen bg-[#0b0718] text-[#ede9fe] flex flex-col selection:bg-violet-500/30 selection:text-white pb-20">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={() => authService.logout()}
        isAiActive={isAiActive}
        marketFeedStatus={marketFeedStatus}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      {/* Real-time Alert Toast Bar if triggered */}
      {latestAlert && (
        <div className="max-w-7xl mx-auto w-full px-4 pt-3">
          <div className="p-3 rounded-2xl bg-gradient-to-r from-violet-900/90 via-fuchsia-950/90 to-black/90 border border-fuchsia-500/40 shadow-xl flex items-center justify-between gap-3 text-xs animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-fuchsia-500/20 flex items-center justify-center text-fuchsia-300">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <span className="font-extrabold text-white text-sm">
                  Oportunidade Detectada: {latestAlert.symbol} ({latestAlert.direction})
                </span>
                <span className="text-violet-300 ml-2">
                  Probabilidade: <b>{latestAlert.prob}%</b> · Confiança: <b>{latestAlert.conf}%</b> · Setup:{' '}
                  <i>{latestAlert.setup}</i>
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setSymbol(latestAlert.symbol);
                setActiveTab('analise');
                setLatestAlert(null);
              }}
              className="px-3 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-xs hover:opacity-90"
            >
              Abrir Gráfico
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full px-4 py-4 flex-1">
        {activeTab === 'analise' && (
          <AnalysisTab
            setups={setups}
            activeSetup={activeSetup}
            onSelectSetup={setActiveSetup}
            filters={filters}
            onOpenCapture={() => setCameraModalOpen(true)}
            candles={candles}
            setCandles={setCandles}
            symbol={symbol}
            setSymbol={setSymbol}
            timeframe={timeframe}
            setTimeframe={setTimeframe}
            marketType={marketType}
            setMarketType={setMarketType}
            onNavigateToConnections={() => setActiveTab('conexao')}
            onFeedStatusChange={setMarketFeedStatus}
          />
        )}

        {activeTab === 'setups' && (
          <SetupsTab
            setups={setups}
            setSetups={setSetups}
            activeSetup={activeSetup}
            setActiveSetup={setActiveSetup}
            candles={candles}
            symbol={symbol}
            onOpenFullBacktest={() => setActiveTab('backtest')}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestTab
            setups={setups}
            activeSetup={activeSetup}
            onSelectSetup={setActiveSetup}
            candles={candles}
            symbol={symbol}
            timeframe={timeframe}
          />
        )}

        {activeTab === 'gestao' && (
          <ManagementTab
            management={management}
            setManagement={setManagement}
          />
        )}

        {activeTab === 'filtros' && (
          <FiltersTab
            filters={filters}
            setFilters={setFilters}
            candles={candles}
          />
        )}

        {activeTab === 'ia-relatorios' && (
          <AIReportsTab
            bankroll={management.bank}
            payout={activeSetup.payout || 85}
          />
        )}

        {activeTab === 'conexao' && (
          <ConnectionsTab
            activeSetup={activeSetup}
            isScanning={isScanning}
            setIsScanning={setIsScanning}
            scanSound={scanSound}
            setScanSound={setScanSound}
          />
        )}

        {activeTab === 'admin' && (
          <AdminTab
            currentUser={currentUser}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}
      </main>

      {/* Floating Bottom Quick Action Dock */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 bg-[#120a28]/90 backdrop-blur-xl border border-violet-500/30 rounded-2xl p-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.6)] flex items-center gap-1.5">
        <button
          onClick={() => openCamera('camera')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 text-xs font-bold border border-violet-500/25 transition-all"
        >
          <Camera className="w-3.5 h-3.5 text-fuchsia-400" />
          <span>Foto / Câmera</span>
        </button>
        <button
          onClick={() => openCamera('screen')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 text-xs font-bold border border-violet-500/25 transition-all"
        >
          <Monitor className="w-3.5 h-3.5 text-violet-300" />
          <span>Gravar Tela</span>
        </button>
        <button
          onClick={() => openCamera('upload')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold shadow-md hover:opacity-95 transition-all"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Enviar Print</span>
        </button>
      </div>

      {/* Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={(user) => setCurrentUser(user)}
      />

      <CameraModal
        isOpen={cameraModalOpen}
        initialMode={cameraInitialMode}
        onClose={() => setCameraModalOpen(false)}
        onCandlesDetected={handleCandlesDetected}
        onApplyDetectedChart={handleApplyDetectedChart}
      />

      <CommandPaletteModal isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commandList} />

      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
