import { Momentum } from "../enums/momentum.enum";
import { Signal } from "../enums/signal.enum";
import { Trend } from "../enums/trend.enum";

export interface MarketSignals {
    emaSignal: Signal; 
    adxSignal: Signal;
    pcrSignal: Signal;
    rsi14: Momentum;
    stoc14: Signal;
    bb20: { signal: Signal; trend: Trend; }; 
    atr14: number;
  }