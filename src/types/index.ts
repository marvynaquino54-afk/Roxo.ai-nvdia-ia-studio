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
}

export interface AIAnalysisResult {
  verdict: string;
  confidence: number;
  recommendation: string;
  confluences: string[];
  riskWarning?: string;
  aiPowered: boolean;
}
