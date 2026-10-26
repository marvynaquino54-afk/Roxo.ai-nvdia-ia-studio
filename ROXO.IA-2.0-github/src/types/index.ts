export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type MarketType = 'crypto' | 'forex' | 'equities' | 'image';

export interface SetupRule {
  id: string;
  type: string;
  pol: 'pro' | 'contra' | 'neutro';
  weight: number;
  params: Record<string, any>;
}

export interface Setup {
  id: string;
  name: string;
  dir: 'alta' | 'baixa' | 'qualquer';
  payout: number;
  timeframe?: string;
  rules: SetupRule[];
  userId?: string;
  updatedAt?: string;
}

export interface FilterConfig {
  id: string;
  on: boolean;
  a: number;
  b: number;
  l: string;
}

export interface BankrollManagement {
  bank: number;
  riskPct: number;
  pay: number;
  ops: number;
  stopPct: number;
  maxLosses: number;
}

export interface TradeRecord {
  id: string;
  timestamp: string;
  symbol: string;
  setupName: string;
  direction: 'CALL' | 'PUT';
  timeframe: string;
  stake: number;
  result: 'WIN' | 'LOSS';
  pnl: number;
}

export interface OpportunityAlert {
  id: string;
  symbol: string;
  tf: string;
  prob: number;
  conf: number;
  setup: string;
  direction: 'CALL' | 'PUT';
  time: string;
  payout: number;
  ev: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'trader';
  createdAt: string;
  passwordHash?: string;
  lastLogin?: string;
}

export type AIRole = 'analista' | 'professor' | 'auditor' | 'explicador' | 'setup' | 'revisor';

export interface AIAnalysisResult {
  verdict: string;
  confidence: number;
  recommendation: string;
  confluences: string[];
  riskWarning?: string;
  aiPowered: boolean;
  role?: AIRole;
  roleTitle?: string;
  executionTimeMs?: number;
  modelUsed?: string;
  fallbackMode?: boolean;
}

export interface BacktestConfig {
  symbol: string;
  timeframe: string;
  candleCount: number;
  payout: number;
  initialCapital: number;
  stakeType: 'fixed' | 'percent';
  stakeValue: number;
  expirationCandles: number;
  minScoreThreshold: number;
  tieAction: 'refund' | 'loss';
}

export interface BacktestTrade {
  id: string;
  index: number;
  timestamp: number;
  timeStr: string;
  direction: 'CALL' | 'PUT';
  entryPrice: number;
  exitPrice: number;
  expirationCandles: number;
  result: 'WIN' | 'LOSS' | 'EMPATE';
  stake: number;
  payout: number;
  pnl: number;
  balanceAfter: number;
  drawdownAfter: number;
  score: number;
  confluences: string[];
}

export interface EquityPoint {
  tradeNum: number;
  timestamp: number;
  balance: number;
  drawdown: number;
  drawdownPct: number;
  pnl: number;
  result: 'WIN' | 'LOSS' | 'EMPATE' | 'START';
}

export interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  breakEvenWinRate: number;
  mathematicalEdge: number;
  expectancy: number;
  profitFactor: number;
  grossProfit: number;
  grossLoss: number;
  netPnL: number;
  roiPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  sharpeRatio: number;
  wilsonConfidenceInterval: [number, number];
}

export interface BacktestRunResult {
  config: BacktestConfig;
  setup: Setup;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  candlesAnalyzed: number;
  executedAt: string;
}

export interface ChartVisionResult {
  isValidChart: boolean;
  confidence: number;
  symbolDetected: string | null;
  timeframeDetected: string | null;
  priceScaleDetected: {
    min: number;
    max: number;
    currentPrice: number;
  } | null;
  patternsDetected: string[];
  trendDetected: 'ALTA' | 'BAIXA' | 'LATERAL' | 'INDEFINIDO';
  rejectionReason: string | null;
  summary: string;
  syncedRealCandlesCount?: number;
  syncedProvider?: string;
}

