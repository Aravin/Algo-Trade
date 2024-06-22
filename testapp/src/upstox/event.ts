import { EventEmitter } from 'node:events';
import { appConfig } from './config';
import axios, { AxiosRequestConfig } from 'axios';
import { ema } from './lib/moving-average';
import { adx14 } from './lib/average-direction-index';
import { calculateOiPcr } from './lib/put-call-ratio';
import { calculateStochasticOscillator } from './lib/stochastic-oscillator';
import { calculateBollingerBands } from './lib/bollinger-bands';
import { currentAtr } from './lib/average-true-range';


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
            const candles = intraDayResponse.data?.candles;
            console.log(candles);

            const optionChainConfig: AxiosRequestConfig = {
                method: 'GET',
                url: `${appConfig.baseUrl}/option/chain?instrument_key=NSE_INDEX|Nifty%2050&expiry_date=2024-06-20`,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: `application/json`,
                }
            };
    
            const optionChainResponse = await axios(optionChainConfig);
            const optionChainData = optionChainResponse.data;

            // 1. calculate ema
            const ema10 = ema(10, candles);
            const ema20 = ema(20, candles);
            const ema42 = ema(42, candles);

            // 2. calculate adx
            const adx = adx14(candles);

            // 3. calculate OI PCR
            const oiPcr = calculateOiPcr(optionChainData);

            // 4. calculate rsi
            const rsi14 = calculateRSI(candles, 14);

            // 5. calculate Stochastic Oscillator
            const stoc14 = calculateStochasticOscillator(candles, 14);

            // 6. calculate Bollinger Bands
            const bb20 = calculateBollingerBands(candles, 20);

            // 7. calculate ATR 
            const atr14 = currentAtr(14, candles);

            
        } catch (error: unknown) {
            console.log((error as Error).message);
        } 
    }, 900);
});

eventEmitter.on('service_stop', () => {
    clearInterval(intraDayDataJob);
});


function calculateRSI(candles: any, arg1: number) {
    throw new Error('Function not implemented.');
}

