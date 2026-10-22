import React, { useState, useEffect, useRef } from 'react';
import { Setup, FilterConfig, BankrollManagement, Candle, MarketType, UserProfile, OpportunityAlert } from './types';
import { authService, cloudStorage } from './services/firebase';
import { DEFAULT_SETUPS, DEFAULT_FILTERS, evaluateSetupProbabilities } from './services/probabilityEngine';
import { fetchMarketCandles } from './services/marketApi';
import { Header } from './components/Header';
import { AnalysisTab } from './components/AnalysisTab';
import { SetupsTab } from './components/SetupsTab';
import { ManagementTab } from './components/ManagementTab';
import { FiltersTab } from './components/FiltersTab';
import { AIReportsTab } from './components/AIReportsTab';
import { ConnectionsTab } from './components/ConnectionsTab';
import { AdminTab } from './components/AdminTab';
import { AuthModal } from './components/AuthModal';
import { CameraModal } from './components/CameraModal';
import { Camera, Monitor, Upload, Bell } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('analise');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);

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
  const [marketFeedStatus, setMarketFeedStatus] = useState<'online' | 'connecting' | 'error'>('online');

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
      } catch {}
    }, 18000);

    return () => clearInterval(interval);
  }, [isScanning, activeSetup, timeframe, scanSound]);

  const handleCandlesDetected = (newCandles: Candle[]) => {
    setCandles(newCandles);
    setMarketType('image');
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
        isAiActive={true}
        marketFeedStatus={marketFeedStatus}
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
          />
        )}

        {activeTab === 'gestao' && (
          <ManagementTab
            management={management}
            setManagement={setManagement}
            estimatedWinRate={0.6}
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

        {activeTab === 'admin' && <AdminTab currentUser={currentUser} />}
      </main>

      {/* Floating Bottom Quick Action Dock */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 bg-[#120a28]/90 backdrop-blur-xl border border-violet-500/30 rounded-2xl p-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.6)] flex items-center gap-1.5">
        <button
          onClick={() => setCameraModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 text-xs font-bold border border-violet-500/25 transition-all"
        >
          <Camera className="w-3.5 h-3.5 text-fuchsia-400" />
          <span>Foto / Câmera</span>
        </button>
        <button
          onClick={() => setCameraModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 text-xs font-bold border border-violet-500/25 transition-all"
        >
          <Monitor className="w-3.5 h-3.5 text-violet-300" />
          <span>Gravar Tela</span>
        </button>
        <button
          onClick={() => setCameraModalOpen(true)}
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
        onClose={() => setCameraModalOpen(false)}
        onCandlesDetected={handleCandlesDetected}
      />
    </div>
  );
}
