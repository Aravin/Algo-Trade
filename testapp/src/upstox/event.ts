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
import { placeBuyOrder } from './controllers/order';
import { Candle } from './lib/types/candle.types';
import { OptionData } from './lib/types/option.types';

export const eventEmitter = new EventEmitter();

let intraDayDataJob: NodeJS.Timeout;

eventEmitter.on('service_start', (token: string) => {
  console.log(`Token generated successfully, starting algo-trade service...`);

  intraDayDataJob = setInterval(async () => {
    try {
      const candles: Candle[] = await intraDayController(); // intraDayResponse.data?.candles;
      const optionChainData: OptionData[] = await optionChainController(token); // optionChainResponse.data;

      // console.log({ candles, optionChainData});

      // const dataPromises = await Promise.all([axios(intraDayConfig), await axios(optionChainConfig)]);

      // 1. calculate ema
      const emaSignal = currentEmaCrossoverSignal(candles, 42, 10);

      // 2. calculate adx
      const adxSignal = adx14Signal(candles);

      // 3. calculate OI PCR
      const pcrSignal = oiPcrSignal(optionChainData);

      // 4. calculate rsi
      const rsi14 = rsiSignal(candles, 14);

      // 5. calculate Stochastic Oscillator
      const stoc14 = stochasticSignal(candles, 14);

      // 6. calculate Bollinger Bands
      const bb20 = bollingerBandsSignals(candles, 20);

      // 7. calculate ATR 
      const atr14 = currentAtr(candles, 14);

      // get details for placing order instrument key, price, etc
      const otm = getOtmDetails(optionChainData);

      // const buyOrderResponse = placeBuyOrder(token, otm.call_options.instrument_key);

      console.log({ timestamp: new Date(), emaSignal, adxSignal, pcrSignal, rsi14, stoc14, bb20, atr14 });

    } catch (error: unknown) {
      console.log((error as Error).message);
      console.log((error as Error).stack);
    }
  }, 1 * 1000 * 60);
});

eventEmitter.on('service_in_progress', (token: string) => {

});

eventEmitter.on('service_stop', () => {
  intraDayDataJob && clearInterval(intraDayDataJob);
});

