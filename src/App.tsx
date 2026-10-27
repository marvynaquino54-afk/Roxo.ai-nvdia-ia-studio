import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Setup, FilterConfig, BankrollManagement, Candle, MarketType, UserProfile, OpportunityAlert } from './types';
import { authService, cloudStorage } from './services/firebase';
import {
  DEFAULT_SETUPS,
  DEFAULT_FILTERS,
  checkFilters,
  evaluateSetupProbabilities,
} from './services/probabilityEngine';
import { runHistoricalBacktest } from './services/backtestEngine';
import { fetchMarketCandles, fetchMarketCandlesDetailed } from './services/marketApi';
import {
  alertFromDraft,
  appendAlert,
  buildJournalDraft,
  resolveSignalDirection,
} from './services/analysisJournal';
import { Header } from './components/Header';
import { DashboardTab } from './components/DashboardTab';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import type { PaletteCommand } from './components/CommandPaletteModal';
import { AI_CONNECTIONS_EVENT, AIConnection, getActiveConnection, loadConnections } from './services/aiClient';
import { AI_STATE_LABELS, getProviderDefinition } from './services/aiProviders';
import { APP_TABS, SHORTCUT_TABS } from './navigation';
import {
  Camera,
  Monitor,
  Upload,
  Bell,
  Keyboard,
  CircleStop,
  User,
  LogOut,
  BookOpen,
  X,
} from 'lucide-react';

// As demais abas e os modais são carregados ao serem abertos: o primeiro acesso
// baixa só a estrutura do app e o Dashboard, não as doze telas e cinco modais.
const AnalysisTab = lazy(() =>
  import('./components/AnalysisTab').then((module) => ({ default: module.AnalysisTab }))
);
const VisionTab = lazy(() =>
  import('./components/VisionTab').then((module) => ({ default: module.VisionTab }))
);
const MonitoringTab = lazy(() =>
  import('./components/MonitoringTab').then((module) => ({ default: module.MonitoringTab }))
);
const JournalTab = lazy(() =>
  import('./components/JournalTab').then((module) => ({ default: module.JournalTab }))
);
const SetupsTab = lazy(() =>
  import('./components/SetupsTab').then((module) => ({ default: module.SetupsTab }))
);
const BacktestTab = lazy(() =>
  import('./components/BacktestTab').then((module) => ({ default: module.BacktestTab }))
);
const ManagementTab = lazy(() =>
  import('./components/ManagementTab').then((module) => ({ default: module.ManagementTab }))
);
const FiltersTab = lazy(() =>
  import('./components/FiltersTab').then((module) => ({ default: module.FiltersTab }))
);
const AIReportsTab = lazy(() =>
  import('./components/AIReportsTab').then((module) => ({ default: module.AIReportsTab }))
);
const AgentTab = lazy(() =>
  import('./components/AgentTab').then((module) => ({ default: module.AgentTab }))
);
const ConnectionsTab = lazy(() =>
  import('./components/ConnectionsTab').then((module) => ({ default: module.ConnectionsTab }))
);
const AdminTab = lazy(() =>
  import('./components/AdminTab').then((module) => ({ default: module.AdminTab }))
);
const AuthModal = lazy(() =>
  import('./components/AuthModal').then((module) => ({ default: module.AuthModal }))
);
const CameraModal = lazy(() =>
  import('./components/CameraModal').then((module) => ({ default: module.CameraModal }))
);
const ShortcutsModal = lazy(() =>
  import('./components/ShortcutsModal').then((module) => ({ default: module.ShortcutsModal }))
);
const IndicatorGlossaryModal = lazy(() =>
  import('./components/IndicatorGlossaryModal').then((module) => ({
    default: module.IndicatorGlossaryModal,
  }))
);
const CommandPaletteModal = lazy(() =>
  import('./components/CommandPaletteModal').then((module) => ({
    default: module.CommandPaletteModal,
  }))
);

function TabLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-6 text-sm text-violet-300 flex items-center gap-2"
    >
      <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
      Carregando tela...
    </div>
  );
}

const SCANNER_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'EURUSD', 'GBPUSD', 'AAPL'];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraInitialMode, setCameraInitialMode] = useState<'upload' | 'camera' | 'screen'>('upload');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);

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
  const [aiConnections, setAiConnections] = useState<AIConnection[]>(() => loadConnections());

  const filterSampleSize = useMemo(() => {
    if (candles.length < 40) return null;
    return runHistoricalBacktest(activeSetup, candles).n;
  }, [activeSetup, candles]);

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

  // O selo de IA no cabeçalho reflete a conexão ativa realmente configurada.
  useEffect(() => {
    const sync = () => setAiConnections(loadConnections());
    window.addEventListener(AI_CONNECTIONS_EVENT, sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener(AI_CONNECTIONS_EVENT, sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const activeAIConnection = useMemo(() => getActiveConnection(aiConnections), [aiConnections]);

  const aiStatus = useMemo(() => {
    if (!activeAIConnection) {
      return {
        label: 'Local',
        detail: 'Nenhum modelo conectado: ferramentas locais e motor estatístico.',
        tone: 'local' as const,
      };
    }
    const provider = getProviderDefinition(activeAIConnection.provider);
    const shortName = provider?.shortName || activeAIConnection.provider;
    if (activeAIConnection.status === 'connected') {
      return {
        label: `${shortName} · OK`,
        detail: `${activeAIConnection.model} confirmado por chamada real.`,
        tone: 'connected' as const,
      };
    }
    if (activeAIConnection.status !== 'not_configured') {
      return {
        label: `${shortName} · atenção`,
        detail:
          activeAIConnection.lastError ||
          AI_STATE_LABELS[activeAIConnection.status],
        tone: 'error' as const,
      };
    }
    return {
      label: `${shortName} · sem teste`,
      detail: `${activeAIConnection.model} ainda não foi confirmado por chamada real.`,
      tone: 'configured' as const,
    };
  }, [activeAIConnection]);

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
        setGlossaryOpen(false);
        return;
      }

      const anyModalOpen = paletteOpen || shortcutsOpen || cameraModalOpen || authModalOpen || glossaryOpen;
      if (anyModalOpen || isEditable(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (e.altKey && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const index = e.key === '0' ? 9 : Number(e.key) - 1;
        const tab = SHORTCUT_TABS[index];
        if (tab) setActiveTab(tab.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen, shortcutsOpen, cameraModalOpen, authModalOpen, glossaryOpen]);

  // Background Opportunity Scanner Loop
  useEffect(() => {
    if (!isScanning) return;

    const candidateSymbols = SCANNER_SYMBOLS;
    let idx = 0;

    const marketTypeFor = (sym: string): MarketType => {
      if (sym.endsWith('USDT')) return 'crypto';
      if (sym.length === 6) return 'forex';
      return 'equities';
    };

    const interval = setInterval(async () => {
      const sym = candidateSymbols[idx % candidateSymbols.length];
      idx++;

      try {
        const detail = await fetchMarketCandlesDetailed(sym, timeframe, 120, marketTypeFor(sym));
        if (!detail.isReal || detail.candles.length <= 20) return;

        const evalRes = evaluateSetupProbabilities(
          activeSetup,
          detail.candles,
          detail.candles.length - 1
        );
        const blocked = evalRes.hasBlockedRules || evalRes.probabilitySource === 'blocked';
        const direction = resolveSignalDirection(activeSetup.dir, evalRes.score, blocked);
        if (direction === 'NEUTRO') return;

        const filterResult = checkFilters(filters, detail.candles, detail.candles.length - 1);
        if (!filterResult.passed) return;

        const draft = buildJournalDraft({
          candles: detail.candles,
          symbol: sym,
          timeframe,
          marketType: marketTypeFor(sym),
          setup: activeSetup,
          payout: activeSetup.payout || 85,
          evaluation: evalRes,
          dataSource: detail.providerName,
          origin: 'scanner',
          direction,
          userId: currentUser?.uid ?? null,
          filterFailures: filterResult.items
            .filter((item) => !item.ok)
            .map((item) => `${item.label}: ${item.reason}`),
        });

        const appended = appendAlert(alertFromDraft(draft));
        if (!appended.added) return;

        setLatestAlert({
          id: appended.alert.id,
          symbol: sym,
          tf: timeframe,
          score: draft.score,
          probability: draft.calibratedProbability,
          probabilitySource: draft.probabilitySource,
          sampleSize: draft.sampleSize,
          conf: evalRes.conf,
          setup: activeSetup.name,
          direction,
          time: new Date().toLocaleTimeString('pt-BR'),
          payout: draft.payout,
          ev: draft.expectedValue,
          createdAt: draft.createdAt,
          signalCandleTime: draft.signalCandleTime,
          signalKey: draft.signalKey,
          setupId: draft.setupId,
          marketType: draft.marketType,
          dataSource: draft.dataSource,
          justification: draft.justification,
          contraryFactors: draft.contraryFactors,
          invalidationConditions: draft.invalidationConditions,
          indicators: draft.indicators,
        });
        playAlertBeep();
      } catch (err) {
        console.warn(`Varredura: falha ao consultar ${sym}`, err);
      }
    }, 18000);

    return () => clearInterval(interval);
  }, [isScanning, activeSetup, timeframe, scanSound, filters, currentUser?.uid]);

  const openCamera = (mode: 'upload' | 'camera' | 'screen') => {
    setCameraInitialMode(mode);
    setCameraModalOpen(true);
  };

  const commandList: PaletteCommand[] = [
    ...APP_TABS.map((tab) => ({
      id: `tab_${tab.id}`,
      title: `Ir para ${tab.label}`,
      subtitle: tab.description,
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
      id: 'glossary',
      title: 'Abrir glossário de indicadores',
      subtitle: 'RSI, MACD, ATR, ADX, score, probabilidade e EV',
      group: 'Ajuda',
      icon: <BookOpen className="w-3 h-3" />,
      perform: () => setGlossaryOpen(true),
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

  // Limpar as velas força o Terminal a buscar o feed do símbolo escolhido, evitando
  // exibir candle de um ativo com o rótulo de outro.
  const openSymbolInTerminal = (nextSymbol: string) => {
    setSymbol(nextSymbol.toUpperCase());
    setCandles([]);
    setMarketFeedStatus('connecting');
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
    const detectedMarketType: MarketType = cleanSym.endsWith('USDT') || cleanSym.endsWith('BTC') || cleanSym.startsWith('BTC') || cleanSym.startsWith('ETH')
      ? 'crypto'
      : cleanSym.length === 6 && (cleanSym.startsWith('EUR') || cleanSym.startsWith('GBP') || cleanSym.startsWith('USD') || cleanSym.startsWith('AUD'))
        ? 'forex'
        : 'equities';
    setMarketType(detectedMarketType);

    if (data.candles && data.candles.length >= 10) {
      setCandles(data.candles);
    } else {
      setCandles([]);
      try {
        const fresh = await fetchMarketCandles(data.symbol, data.timeframe, 120, detectedMarketType);
        setCandles(fresh.length > 0 ? fresh : []);
      } catch (err) {
        console.warn('Erro ao atualizar velas pós-OCR:', err);
        setCandles([]);
      }
    }

    setActiveTab('analise');
  };

  return (
    <div className="min-h-screen bg-[#0b0718] text-[#ede9fe] flex flex-col selection:bg-violet-500/30 selection:text-white pb-20">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Pular para o conteúdo principal
      </a>

      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={() => authService.logout()}
        aiStatus={aiStatus}
        marketFeedStatus={marketFeedStatus}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenGlossary={() => setGlossaryOpen(true)}
      />

      {/* Real-time Alert Toast Bar if triggered */}
      {latestAlert && (
        <div className="max-w-7xl mx-auto w-full px-4 pt-3" aria-live="polite">
          <div className="p-3 rounded-2xl bg-gradient-to-r from-violet-900/90 via-fuchsia-950/90 to-black/90 border border-fuchsia-500/40 shadow-xl flex items-center justify-between gap-3 text-xs animate-fadeIn">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-fuchsia-500/20 flex items-center justify-center text-fuchsia-300 shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="font-extrabold text-white text-sm">
                  Alerta: {latestAlert.symbol} · {latestAlert.direction}
                </span>
                <span className="text-violet-300 ml-2">
                  Score <b>{latestAlert.score}/100</b> · <i>{latestAlert.setup}</i>
                </span>
                <div className="text-[10px] text-violet-400/80 mt-0.5 truncate">
                  {latestAlert.probability !== null
                    ? `Probabilidade histórica ${latestAlert.probability}% (n=${latestAlert.sampleSize})`
                    : 'Probabilidade não calibrada: sem amostra histórica mínima'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => {
                  setActiveTab('diario');
                  setLatestAlert(null);
                }}
                className="px-3 py-1 rounded-lg bg-violet-600/30 border border-violet-500/40 text-violet-100 font-bold text-xs hover:bg-violet-600/50 flex items-center gap-1"
              >
                <BookOpen className="w-3 h-3" /> Ver no Diário
              </button>
              <button
                onClick={() => {
                  openSymbolInTerminal(latestAlert.symbol);
                  setLatestAlert(null);
                }}
                className="px-3 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-xs hover:opacity-90"
              >
                Abrir Gráfico
              </button>
              <button
                onClick={() => setLatestAlert(null)}
                aria-label="Fechar alerta"
                className="p-1 rounded-lg text-violet-300 hover:text-white hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main id="conteudo-principal" tabIndex={-1} className="max-w-7xl mx-auto w-full px-4 py-4 flex-1 outline-none">
        <AppErrorBoundary>
          <Suspense fallback={<TabLoadingFallback />}>
          {activeTab === 'dashboard' && (
            <DashboardTab
              currentUser={currentUser}
              management={management}
              setups={setups}
              activeSetup={activeSetup}
              symbol={symbol}
              timeframe={timeframe}
              candles={candles}
              marketFeedStatus={marketFeedStatus}
              aiStatus={aiStatus}
              isScanning={isScanning}
              latestAlert={latestAlert}
              onToggleScanning={() => setIsScanning((value) => !value)}
              onNavigate={setActiveTab}
              onOpenCapture={openCamera}
              onOpenGlossary={() => setGlossaryOpen(true)}
            />
          )}

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
              currentUser={currentUser}
              onOpenJournal={() => setActiveTab('diario')}
              onNavigateToConnections={() => setActiveTab('conexao')}
              onFeedStatusChange={setMarketFeedStatus}
            />
          )}

          {activeTab === 'vision' && (
            <VisionTab
              onOpenCapture={openCamera}
              onNavigate={setActiveTab}
              symbol={symbol}
              timeframe={timeframe}
            />
          )}

          {activeTab === 'monitoramento' && (
            <MonitoringTab
              isScanning={isScanning}
              setIsScanning={setIsScanning}
              scanSound={scanSound}
              setScanSound={setScanSound}
              latestAlert={latestAlert}
              activeSetup={activeSetup}
              filters={filters}
              timeframe={timeframe}
              candidateSymbols={SCANNER_SYMBOLS}
              onNavigate={setActiveTab}
              onOpenSymbol={openSymbolInTerminal}
            />
          )}

        {activeTab === 'agente' && (
          <AgentTab
            currentUser={currentUser}
            symbol={symbol}
            timeframe={timeframe}
            marketType={marketType}
            feedStatus={marketFeedStatus}
            candles={candles}
            setups={setups}
            activeSetup={activeSetup}
            filters={filters}
            management={management}
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
            sampleSize={filterSampleSize}
            symbol={symbol}
            timeframe={timeframe}
          />
        )}

        {activeTab === 'diario' && <JournalTab management={management} />}

        {activeTab === 'ia-relatorios' && (
          <AIReportsTab
            bankroll={management.bank}
            payout={activeSetup.payout || 85}
            initialSetupName={activeSetup.name}
            initialTimeframe={timeframe}
          />
        )}

        {activeTab === 'conexao' && (
          <ConnectionsTab
            activeSetup={activeSetup}
            isScanning={isScanning}
            setIsScanning={setIsScanning}
            scanSound={scanSound}
            setScanSound={setScanSound}
            onOpenMonitoring={() => setActiveTab('monitoramento')}
          />
        )}

        {activeTab === 'admin' && (
          <AdminTab
            currentUser={currentUser}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}
          </Suspense>
        </AppErrorBoundary>
      </main>

      {/* Atalho flutuante para a captura de gráficos (os três modos ficam na aba Roxo Vision) */}
      <button
        onClick={() => setActiveTab('vision')}
        title="Roxo Vision — enviar print, usar câmera ou gravar tela"
        aria-label="Abrir Roxo Vision para capturar gráfico"
        className="fixed bottom-3 right-3 z-40 w-12 h-12 rounded-full bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white shadow-[0_8px_25px_rgba(168,85,247,0.5)] border border-white/15 flex items-center justify-center hover:opacity-95 transition-opacity"
      >
        <Camera className="w-5 h-5" />
      </button>

      {/* Modals */}
      <Suspense fallback={null}>
        {authModalOpen && (
          <AuthModal
            isOpen
            onClose={() => setAuthModalOpen(false)}
            onLoginSuccess={(user) => setCurrentUser(user)}
          />
        )}

        {cameraModalOpen && (
          <CameraModal
            isOpen
            initialMode={cameraInitialMode}
            onClose={() => setCameraModalOpen(false)}
            onCandlesDetected={handleCandlesDetected}
            onApplyDetectedChart={handleApplyDetectedChart}
          />
        )}

        {paletteOpen && (
          <CommandPaletteModal isOpen onClose={() => setPaletteOpen(false)} commands={commandList} />
        )}

        {shortcutsOpen && <ShortcutsModal isOpen onClose={() => setShortcutsOpen(false)} />}

        {glossaryOpen && (
          <IndicatorGlossaryModal isOpen onClose={() => setGlossaryOpen(false)} />
        )}
      </Suspense>
    </div>
  );
}
