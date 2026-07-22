// Enums & String Unions
export type SignalType = 'Buy' | 'Sell' | 'Hold'
export type MomentumType = 'Overbought' | 'Oversold' | 'Hold'
export type TrendType = 'Up' | 'Down' | 'Neutral'
export type VolatilityLevel = 'High' | 'Low' | 'Neutral'
export type GlobalSentiment = 'bullish' | 'bearish' | 'neutral'
export type NiftySentiment =
  | 'very bullish'
  | 'bullish'
  | 'neutral'
  | 'bearish'
  | 'very bearish'
export type PcrZone = 'buy' | 'sell' | 'neutral' | 'overbought' | 'oversold'
export type V3OrderType = 'buy' | 'sell' | 'hold'
export type ExecutionMode = 'live' | 'paper'
export type BrokerPurpose = 'analytics' | 'market-data' | 'orders'
export type NotificationType = 'info' | 'success' | 'warn' | 'error'

export type UnderlyingSymbol = 'NIFTY 50' | 'BANKNIFTY' | 'FINNIFTY'
export type UnderlyingMode = UnderlyingSymbol | 'ALL_PARALLEL'

export const UNDERLYING_INSTRUMENT_KEYS: Record<UnderlyingSymbol, string> = {
  'NIFTY 50': 'NSE_INDEX|Nifty 50',
  BANKNIFTY: 'NSE_INDEX|Nifty Bank',
  FINNIFTY: 'NSE_INDEX|Nifty Fin Service',
}

// Indicators & Options
export type Candle = [
  string,
  number,
  number,
  number,
  number,
  number,
  (number | undefined)?,
]

interface OptionGreeks {
  iv: number
  delta: number
  theta: number
  vega: number
  gamma: number
}

export interface OptionData {
  expiry: string
  strike_price: number
  underlying_spot_price: number
  call_options: {
    instrument_key: string
    trading_symbol?: string
    market_data: { ltp: number; volume: number; oi: number }
    option_greeks?: OptionGreeks
  }
  put_options: {
    instrument_key: string
    trading_symbol?: string
    market_data: { ltp: number; volume: number; oi: number }
    option_greeks?: OptionGreeks
  }
}

export interface IndicatorsResult {
  ema: SignalType
  adx: SignalType
  rsi: { value: number; signal: MomentumType }
  stochastic: { k: number; d: number; signal: SignalType }
  bollinger: {
    upper: number
    middle: number
    lower: number
    signal: SignalType
    trend: TrendType
  }
  atr: { value: number; level: VolatilityLevel }
  pcr: SignalType
  pcrValue: number
}

// VRD Signals
export interface VrdData {
  mmi: { score: number | null; label: string | null } | null
  advancesDeclines: {
    advances: number | null
    declines: number | null
    ratio: number | null
    label: string | null
  } | null
  fiiLongShort: {
    longPct: number | null
    shortPct: number | null
    shortPctTrend: 'Rising' | 'Falling' | 'Stable' | null
  } | null
  fiiPositioning: {
    netPosition: number | null
    consecutiveShortDays: number | null
  } | null
  pcr: { value: number | null; zone: string | null } | null
  straddleIv: {
    elevated: boolean | null
    percentAboveAvg: number | null
  } | null
  niftyPe: { pe: number | null; label: string | null } | null
  vix: number | null
  giftNifty: {
    price: number | null
    changePts: number | null
    changePct: number | null
    openingSignal: 'Gap Up' | 'Gap Down' | 'Flat' | null
  } | null
  supportWall: number | null
  resistanceWall: number | null
  maxPain: number | null
  newsAlerts?: NewsAlert[]
  fetchedAt: string
}

export interface VrdScore {
  score: number
  max: number
  label: string
  detail?: string
}

export interface McMarketItem {
  symbol: string
  technical_rating?: string
  change_per?: number
  [key: string]: unknown
}

// Strategy Engine
export interface ScoreBreakdown {
  layer: string
  indicator: string
  condition: string
  points: number
  max: number
}

export interface ScoreResult {
  score: number
  max: number
  breakdown: ScoreBreakdown[]
}

export interface FinalSignal {
  signal: 'BUY_CE' | 'BUY_PE' | 'WAIT' | 'NO_TRADE'
  confidence: 'strong' | 'moderate' | 'weak' | 'none'
  positionSize: 'full' | 'half' | 'none'
  v3: V3OrderType
  v4: SignalType
  bullScore: number
  bearScore: number
  scoreMax: number
}

export interface AllSignalData {
  v3: V3OrderType
  indicators: IndicatorsResult
  vrd: VrdData | null
  globalIndices?: McMarketItem[]
}

export interface PositionLeg {
  instrumentKey: string
  direction: 'CE' | 'PE'
  entryPrice: number
  quantity: number
  tradeType: 'buying' | 'selling'
  paperTradeId?: string
  currentPrice?: number
  unrealizedPnl?: number
}

export interface ActivePosition {
  instrumentKey: string
  direction: 'CE' | 'PE'
  entryPrice: number
  quantity: number
  entryTime: string
  tradeId: number
  executionMode?: ExecutionMode
  paperTradeId?: string
  tradeType?: 'buying' | 'selling' | 'both'
  currentPrice?: number
  unrealizedPnl?: number
  legs?: PositionLeg[]
  exitedLegs?: string[]
  underlyingSymbol?: UnderlyingSymbol
}

export type StrategyMode = 'v5_scorecard' | 'bollinger_squeeze'

export interface BollingerSqueezeMetrics {
  isSqueezing: boolean
  bandwidthPct: number
  squeezeThresholdPct: number
  squeezeCandleCount: number
  breakoutDirection: 'CE' | 'PE' | 'NONE'
  adxValue: number
}

// Strategy Config
export interface StrategyConfig {
  strategyMode: StrategyMode
  underlyingMode: UnderlyingMode
  multiSymbolExecutionMode?: 'independent' | 'consensus' | 'best_signal'
  squeezeThresholdPct: number
  minSqueezeCandles: number
  adxMinThreshold: number
  strongThreshold: number
  moderateThreshold: number
  /** Minimum bull−bear gap required for Strong confidence (default 6) */
  strongGap: number
  /** Minimum bull−bear gap required for Moderate confidence (default 3) */
  moderateGap: number
  maxProfitPct: number
  maxLossPct: number
  maxTradesPerDay: number
  lastEntryTime: string
  pollingIntervalSec: number
  minConfidence: 'strong' | 'moderate'
  otmSkip: number
  executionMode: ExecutionMode
  tradeType: 'buying' | 'selling' | 'both'
}

// Paper Trading
interface PaperAccount {
  id: string
  mode: string
  balance: number
  currency: string
  updated_at: string
}

interface PaperStatementEntry {
  id: string
  entry_type: string
  amount: number
  balance_before: number
  balance_after: number
  note: string | null
  metadata_json: string | null
  created_at: string
}

export interface PaperTrade {
  id: string
  account_id: string
  status: string
  instrument_key: string
  direction: string
  quantity: number
  entry_price: number
  entry_value: number
  exit_price: number | null
  exit_value: number | null
  realized_pnl: number | null
  opened_at: string
  closed_at: string | null
  metadata_json: string | null
}

export interface PaperAccountSummary {
  account: PaperAccount
  recentEntries: PaperStatementEntry[]
  openTradeCount: number
  trades?: PaperTrade[]
}

// Broker Accounts
export interface BrokerAccount {
  id: string
  label: string
  broker: 'upstox'
  apiKey?: string
  accessToken?: string
  analyticsToken?: string
  purpose: BrokerPurpose[]
  status: 'connected' | 'disconnected'
  connectedAt?: string
}

// Notifications
export interface AppNotification {
  id: string
  title: string
  message: string
  type: NotificationType
  timestamp: string
  read: boolean
}

// Constants & Config Values
export const DEFAULT_CONFIG: StrategyConfig = {
  strategyMode: 'v5_scorecard',
  underlyingMode: 'ALL_PARALLEL',
  multiSymbolExecutionMode: 'independent',
  squeezeThresholdPct: 1.2,
  minSqueezeCandles: 3,
  adxMinThreshold: 20,
  strongThreshold: 14,
  moderateThreshold: 10,
  strongGap: 6,
  moderateGap: 3,
  maxProfitPct: 10,
  maxLossPct: 5,
  maxTradesPerDay: 3,
  lastEntryTime: '14:30',
  pollingIntervalSec: 60,
  minConfidence: 'moderate',
  otmSkip: 3,
  executionMode: 'paper',
  tradeType: 'buying',
}

export const ACCOUNTS_CHANGED_EVENT = 'algo-trade:accounts-changed'

export const SKIP_SYMBOLS: string[] = []

export const globalNiftyMapping = [
  { globalSentiment: 'bearish', marketSentiment: 'very bearish', canTrade: 1 },
  { globalSentiment: 'bearish', marketSentiment: 'bearish', canTrade: 1 },
  { globalSentiment: 'bearish', marketSentiment: 'neutral', canTrade: 1 },
  { globalSentiment: 'bearish', marketSentiment: 'bullish', canTrade: 0 },
  { globalSentiment: 'bearish', marketSentiment: 'very bullish', canTrade: 0 },
  { globalSentiment: 'neutral', marketSentiment: 'very bearish', canTrade: 1 },
  { globalSentiment: 'neutral', marketSentiment: 'bearish', canTrade: 1 },
  { globalSentiment: 'neutral', marketSentiment: 'neutral', canTrade: 1 },
  { globalSentiment: 'neutral', marketSentiment: 'bullish', canTrade: 1 },
  { globalSentiment: 'neutral', marketSentiment: 'very bullish', canTrade: 1 },
  { globalSentiment: 'bullish', marketSentiment: 'very bearish', canTrade: 0 },
  { globalSentiment: 'bullish', marketSentiment: 'bearish', canTrade: 0 },
  { globalSentiment: 'bullish', marketSentiment: 'neutral', canTrade: 1 },
  { globalSentiment: 'bullish', marketSentiment: 'bullish', canTrade: 1 },
  { globalSentiment: 'bullish', marketSentiment: 'very bullish', canTrade: 1 },
]

export const marketStrategyMapping: {
  marketSentiment: string
  putCallRatio: string
  orderType: string | null
}[] = [
  {
    marketSentiment: 'very bearish',
    putCallRatio: 'oversold',
    orderType: 'buy',
  },
  { marketSentiment: 'bearish', putCallRatio: 'oversold', orderType: 'buy' },
  { marketSentiment: 'neutral', putCallRatio: 'oversold', orderType: 'buy' },
  { marketSentiment: 'bullish', putCallRatio: 'oversold', orderType: 'buy' },
  {
    marketSentiment: 'very bullish',
    putCallRatio: 'oversold',
    orderType: 'buy',
  },
  { marketSentiment: 'very bearish', putCallRatio: 'sell', orderType: 'sell' },
  { marketSentiment: 'bearish', putCallRatio: 'sell', orderType: 'sell' },
  { marketSentiment: 'neutral', putCallRatio: 'sell', orderType: 'sell' },
  { marketSentiment: 'bullish', putCallRatio: 'sell', orderType: null },
  { marketSentiment: 'very bullish', putCallRatio: 'sell', orderType: null },
  {
    marketSentiment: 'very bearish',
    putCallRatio: 'neutral',
    orderType: 'sell',
  },
  { marketSentiment: 'bearish', putCallRatio: 'neutral', orderType: 'sell' },
  { marketSentiment: 'neutral', putCallRatio: 'neutral', orderType: 'hold' },
  { marketSentiment: 'bullish', putCallRatio: 'neutral', orderType: 'buy' },
  {
    marketSentiment: 'very bullish',
    putCallRatio: 'neutral',
    orderType: 'buy',
  },
  { marketSentiment: 'very bearish', putCallRatio: 'buy', orderType: 'buy' },
  { marketSentiment: 'bearish', putCallRatio: 'buy', orderType: 'buy' },
  { marketSentiment: 'neutral', putCallRatio: 'buy', orderType: 'buy' },
  { marketSentiment: 'bullish', putCallRatio: 'buy', orderType: 'buy' },
  { marketSentiment: 'very bullish', putCallRatio: 'buy', orderType: 'buy' },
  {
    marketSentiment: 'very bearish',
    putCallRatio: 'overbought',
    orderType: 'sell',
  },
  { marketSentiment: 'bearish', putCallRatio: 'overbought', orderType: 'sell' },
  { marketSentiment: 'neutral', putCallRatio: 'overbought', orderType: 'sell' },
  { marketSentiment: 'bullish', putCallRatio: 'overbought', orderType: 'sell' },
  {
    marketSentiment: 'very bullish',
    putCallRatio: 'overbought',
    orderType: 'sell',
  },
]

export type TradeRowStatus =
  | 'ACTIVE'
  | 'CLOSED'
  | 'SL_HIT'
  | 'TARGET_HIT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'

export interface UpstoxNewsItem {
  headline: string
  summary: string
  thumbnail_url?: string
  article_link?: string
  published_timestamp: number // unix ms
}

export interface NewsAlert {
  id: string
  headline: string
  summary: string
  type: 'MACRO' | 'EARNINGS' | 'GENERAL'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  timestamp: number
  matchedKeywords: string[]
}
