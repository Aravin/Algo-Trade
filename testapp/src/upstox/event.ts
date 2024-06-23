import { EventEmitter } from 'node:events';
import { appConfig } from './config';
import axios, { AxiosRequestConfig } from 'axios';
import { currentEmaCrossoverSignal, ema } from './lib/moving-average';
import { adx14Signal } from './lib/average-direction-index';
import { oiPcrSignal } from './lib/put-call-ratio';
import { stochasticSignal } from './lib/stochastic-oscillator';
import { bollingerBandsSignals } from './lib/bollinger-bands';
import { atrVolatility } from './lib/average-true-range';
import { optionsChainMockResponse } from './mocks/option-chain.mock';
import { intradayMockResponse } from './mocks/intraday.mock';
import { Candle } from './lib/types/candle.types';
import { rsiSignal } from './lib/rsi';

export const eventEmitter = new EventEmitter();

let intraDayDataJob: NodeJS.Timeout;

eventEmitter.on('token_success', (token: string) => {
  console.log(`Token generated successfully, starting algo-trade service...`);

  intraDayDataJob = setInterval(async () => {
    try {
      const intraDayConfig: AxiosRequestConfig = {
        method: 'GET',
        url: `${appConfig.baseUrl}/historical-candle/intraday/NSE_INDEX|Nifty%2050/1minute`,
      };

      const intraDayResponse = await axios(intraDayConfig);
      const candles = intradayMockResponse.data.candles as Candle[]; // intraDayResponse.data?.candles;
      // console.log(candles);

      const optionChainConfig: AxiosRequestConfig = {
        method: 'GET',
        url: `${appConfig.baseUrl}/option/chain?instrument_key=NSE_INDEX|Nifty%2050&expiry_date=2024-06-20`,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: `application/json`,
        }
      };

      const optionChainResponse = await axios(optionChainConfig);
      const optionChainData = optionsChainMockResponse.data; // optionChainResponse.data;

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
      const atr14 = atrVolatility(candles, 14, 0.35, 0.65);

      console.log({ emaSignal, adxSignal, pcrSignal, rsi14, stoc14, bb20, atr14 });

    } catch (error: unknown) {
      console.log((error as Error).message);
      console.log((error as Error).stack);
    }
  }, 900);
});

eventEmitter.on('service_stop', () => {
  intraDayDataJob && clearInterval(intraDayDataJob);
});

