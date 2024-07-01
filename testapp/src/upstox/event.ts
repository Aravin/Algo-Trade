import { EventEmitter } from 'node:events';
import fs from 'fs';

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

import { getISTTime } from './lib/calculations/ist-datetime';

// Helper function to convert signal data to CSV format
function formatSignalForCSV(signalData: any): string {
  if (typeof signalData === 'object') {
    if ('signal' in signalData && 'trend' in signalData) {
      const { signal, trend } = signalData as { signal: Signal, trend: Trend };
      return `${signal},${trend}`;
    } else {
      return Object.entries(signalData)
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
    }
  } else {
    return String(signalData);
  }
}

// For demonstration, let's use a basic logging function:
// In a real application, consider using a dedicated logging library 
// like Winston or Pino for more robust logging.

// Define color functions for different log levels (using IST time)
const logInfo = (message: string, data?: any) => {
  console.log((`[${getISTTime()}] INFO: ${message}`), data ? JSON.stringify(data) : '');
};

const log = logInfo;

const logError = (message: string, error?: any) => {
  console.error((`[${getISTTime()}] ERROR: ${message}`), error ? error : '');
};

const logSuccess = (message: string, data?: any) => {
  console.log((`[${getISTTime()}] SUCCESS: ${message}`), data ? JSON.stringify(data) : '');
};

const logWarning = (message: string, data?: any) => {
  console.warn((`[${getISTTime()}] WARN: ${message}`), data ? JSON.stringify(data) : '');
};

export const eventEmitter = new EventEmitter();

let intraDayDataJob: NodeJS.Timeout;

const calculateSignals = (candles: Candle[], optionChainData: OptionData[]): MarketSignals => {
  try {
    const emaSignal = currentEmaCrossoverSignal(candles, 42, 10);
    const adxSignal = adx14Signal(candles);
    const pcrSignal = oiPcrSignal(optionChainData);
    const rsi14 = rsiSignal(candles, 14);
    const stoc14 = stochasticSignal(candles, 14);
    const bb20 = bollingerBandsSignals(candles, 20);
    const atr14 = currentAtr(candles, 14);

    const signals: MarketSignals = {
      emaSignal, adxSignal, pcrSignal, rsi14, stoc14, bb20, atr14
    };

    // --- CSV Logging (write header only once) ---
    const csvHeaders = Object.keys(signals).join(',');
    const csvValues = Object.values(signals).map(formatSignalForCSV).join(',');

    const csvFilePath = 'signals_log.csv';
    const headerExists = fs.existsSync(csvFilePath) && fs.statSync(csvFilePath).size > 0;

    fs.appendFileSync(
      csvFilePath,
      `${headerExists ? '' : csvHeaders + '\n'}${csvValues}\n`
    );

    // --- JSON Logging (stringify the entire object once) ---
    fs.appendFileSync('signals_log.json', JSON.stringify(signals) + '\n');

    log('Calculated Signals:', signals); // Log the calculated signals
    return signals;

  } catch (error: unknown) {
    logError('Error calculating signals:', error);
    // Re-throw to be handled at a higher level if needed
    throw error;
  }
};

const executeTradeLogic = async (token: string, signals: MarketSignals, optionChainData: OptionData[]) => {
  try {
    const { emaSignal, adxSignal, pcrSignal, bb20, rsi14 } = signals;

    log('Evaluating Trade Logic'); // Log the signals being evaluated

    if (
      (emaSignal === adxSignal && adxSignal === pcrSignal && pcrSignal === bb20.signal && rsi14 === Momentum.Hold) ||
      (emaSignal === Signal.Buy && bb20.trend !== Trend.Down || emaSignal === Signal.Sell && bb20.trend !== Trend.Up)
    ) {
      log("EMA, ADX, PCR, BB, and RSI signals align:", emaSignal);

      switch (emaSignal) {
        case "Buy": {
          log("Executing Buy logic");
          const strike = getOtmDetails(optionChainData);
          logSuccess("Placing Buy order for:", { token, instrumentKey: strike.call_options.instrument_key });
          await placeOrder(token, strike.call_options.instrument_key);
          eventEmitter.emit('service_entered', token, strike.call_options.instrument_key, emaSignal, bb20);
          break;
        }
        case "Sell": {
          log("Executing Sell logic");
          const strike = getOtmDetails(optionChainData);
          logSuccess("Placing Sell order for:", { token, instrumentKey: strike.put_options.instrument_key });
          await placeOrder(token, strike.put_options.instrument_key);
          eventEmitter.emit('service_entered', token, strike.put_options.instrument_key, emaSignal);
          break;
        }
        case "Hold":
          log("Execute Hold logic - No action taken.");
          break;
        default:
          log("Unknown signal:", emaSignal);
      }
    } else {
      logWarning("Signals do not align. No trade will be executed.");
    }
  } catch (error: unknown) {
    logError("Error executing trade logic:", error);
    throw error; // Re-throw for higher-level handling 
  }
};


const handleData = async (token: string) => {
  try {
    log("Fetching market data...");
    const [candles, optionChainData]: [Candle[], OptionData[]] = await Promise.all([
      intraDayController(),
      optionChainController(token),
    ]);

    log("Market data fetched successfully." /*, { candles, optionChainData }*/);
    const signals = calculateSignals(candles, optionChainData);

    await executeTradeLogic(token, signals, optionChainData);

  } catch (error: unknown) {
    logError("Error in handleData:", error);
  }
};

eventEmitter.on('service_start', (token: string) => {
  log(`Token generated: ${token}, starting algo-trade service...`);
  intraDayDataJob = setInterval(() => handleData(token), 1 * 60 * 1000);
});

eventEmitter.on('service_entered', (token: string, instrumentKey: string, signal: Signal, trend: Trend) => {
  log(`Order placed - token ${token}, instrumentKey: ${instrumentKey}, signal: ${signal}`);
  clearInterval(intraDayDataJob);

  const orderType = signal === Signal.Buy ? 'SELL' : 'BUY';

  intraDayDataJob = setInterval(async () => {
    try {
      const candles: Candle[] = await intraDayController();
      const optionChainData: OptionData[] = await optionChainController(token);
      const signals = calculateSignals(candles, optionChainData);
      log("Monitoring for exit conditions...", signals); // Log signals being monitored

      if (
        [signals.emaSignal, signals.adxSignal, signals.pcrSignal].some((_) => _.includes(orderType)) ||
        [signals.bb20.signal, signals.stoc14].some((_) => _.includes(orderType)) ||
        signals.bb20.trend !== trend ||
        signals.rsi14 === Momentum.Overbought || signals.rsi14 === Momentum.Oversold
      ) {
        log("Signals indicate exit:", signals.emaSignal);
        log("Placing exit order for:", { token, instrumentKey, orderType });
        await placeOrder(token, instrumentKey, orderType);
      } else {
        log("Signals do not indicate exit. Continuing to monitor...");
      }
    } catch (error: unknown) {
      logError("Error in service_entered handler:", error);
    }
  }, 1 * 60 * 1000);
});

eventEmitter.on('service_exit', () => {
  log("Exiting algo-trade service.");
  clearInterval(intraDayDataJob);
});