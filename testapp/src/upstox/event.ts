import { EventEmitter } from 'node:events';
import { currentEmaCrossoverSignal } from './lib/moving-average';
import { adx14Signal } from './lib/average-direction-index';
import { oiPcrSignal } from './lib/put-call-ratio';
import { stochasticSignal } from './lib/stochastic-oscillator';
import { bollingerBandsSignals } from './lib/bollinger-bands';
import { currentAtr } from './lib/average-true-range';
import { rsiSignal } from './lib/rsi';
import { optionChainController } from './controllers/option-chain';
import { intraDayController } from './controllers/intraday-data';
import { getOtmDetails } from './lib/calculations/get-otm-details';
import { placeOrder } from './controllers/order';
import { Candle } from './lib/types/candle.types';
import { OptionData } from './lib/types/option.types';
import { Signal } from './lib/enums/signal.enum';
import { Trend } from './lib/enums/trend.enum';
import { MarketSignals } from './lib/types/market-signal.types';
import { Momentum } from './lib/enums/momentum.enum';

export const eventEmitter = new EventEmitter();

let intraDayDataJob: NodeJS.Timeout;

const calculateSignals = (candles: Candle[], optionChainData: OptionData[]): MarketSignals => {
  return {
    emaSignal: currentEmaCrossoverSignal(candles, 42, 10),
    adxSignal: adx14Signal(candles),
    pcrSignal: oiPcrSignal(optionChainData),
    rsi14: rsiSignal(candles, 14),
    stoc14: stochasticSignal(candles, 14),
    bb20: bollingerBandsSignals(candles, 20),
    atr14: currentAtr(candles, 14)
  };
};

const executeTradeLogic = async (token: string, signals: MarketSignals, optionChainData: OptionData[]) => {
  // Pass optionChainData here
  const { emaSignal, adxSignal, pcrSignal, bb20, rsi14 } = signals;

  if (
    (emaSignal === adxSignal && adxSignal === pcrSignal && pcrSignal === bb20.signal && rsi14 === Momentum.Hold)
    || (emaSignal === Signal.Buy && bb20.trend !== Trend.Down || emaSignal === Signal.Sell && bb20.trend !== Trend.Up)) {
    console.log("EMA, ADX, PCR, BB, and RSI signals align:", emaSignal);

    switch (emaSignal) {
      case "Buy":
        {
          console.log("Executing Buy logic");
          const strike = getOtmDetails(optionChainData);
          await placeOrder(token, strike.call_options.instrument_key);
          eventEmitter.emit('service_entered', token, strike.call_options.instrument_key, emaSignal, bb20);
        }
        break;
      case "Sell":
        {
          console.log("Executing Sell logic");
          const strike = getOtmDetails(optionChainData);
          await placeOrder(token, strike.put_options.instrument_key);
          eventEmitter.emit('service_entered', token, strike.put_options.instrument_key, emaSignal);
        }
        break;
      case "Hold":
        console.log("Execute Hold logic");
        break;
      default:
        console.log("Unknown signal:", emaSignal);
    }
  } else {
    console.log("Signals do not align.");
  }
};

const handleData = async (token: string) => {
  try {
    const [candles, optionChainData] = await Promise.all([
      intraDayController(),
      optionChainController(token),
    ]);

    const signals = calculateSignals(candles, optionChainData);

    console.log({ timestamp: new Date(), ...signals });
    executeTradeLogic(token, signals, optionChainData);

  } catch (error: unknown) {
    console.error((error as Error).message);
    console.error((error as Error).stack);
  }
};

eventEmitter.on('service_start', (token: string) => {
  console.log({ token });
  console.log(`Token generated, starting algo-trade service...`);

  intraDayDataJob = setInterval(() => handleData(token), 60 * 1000);
});

eventEmitter.on('service_entered', (token: string, instrumentKey: string, signal: Signal, trend: Trend) => {
  console.log(`Order placed - token ${token}`);
  clearInterval(intraDayDataJob);

  const orderType = signal === Signal.Buy ? 'SELL' : 'BUY';

  intraDayDataJob = setInterval(async () => {
    try {
      const candles: Candle[] = await intraDayController();
      const optionChainData: OptionData[] = await optionChainController(token); // Fetch option data
      const signals = calculateSignals(candles, optionChainData);

      console.log({ timestamp: new Date(), ...signals });

      if (
        [signals.emaSignal, signals.adxSignal, signals.pcrSignal].some((_) => _.includes(orderType))
        || [signals.bb20.signal, signals.stoc14].some((_) => _.includes(orderType))
        || signals.bb20.trend !== trend
        || signals.rsi14 === Momentum.Overbought || signals.rsi14 === Momentum.Oversold
      ) {
        console.log("Signals indicate exit:", signals.emaSignal);
        await placeOrder(token, instrumentKey, orderType);

      } else {
        console.log("Signals do not indicate exit.");
      }

    } catch (error: unknown) {
      console.error((error as Error).message);
      console.error((error as Error).stack);
    }
  }, 60 * 1000);
});

eventEmitter.on('service_exit', () => {
  clearInterval(intraDayDataJob);
});
