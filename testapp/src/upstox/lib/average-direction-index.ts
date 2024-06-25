import { Signal } from "./enums/signal.enum";
import { ema } from "./moving-average";
import { Candle } from "./types/candle.types";

// Function to calculate Average Directional Index (ADX) for current time (period 14)
export const adx14Signal = (candles: Candle[]): Signal => {
    const period = 14;
    candles = candles.slice(0, period);

    if (period <= 0 || period > candles.length) {
        throw new Error("Invalid period. Please enter a positive number less than or equal to the data length.");
    }

    const pdms: number[] = new Array(candles.length).fill(0);
    const ndms: number[] = new Array(candles.length).fill(0);

    for (let i = 1; i < candles.length; i++) {
        const currentHigh = candles[i][2];   // Corrected: Accessing the high
        const currentLow = candles[i][3];    // Corrected: Accessing the low
        const prevClose = candles[i - 1][4];

        // Calculate +DM and -DM for each candle
        pdms[i] = Math.max(0, currentHigh - prevClose) - Math.max(0, prevClose - candles[i - 1][2]);
        ndms[i] = Math.max(0, prevClose - currentLow) - Math.max(0, currentLow - candles[i - 1][3]);
    }

    const plusDi = ema(period, pdms);
    const minusDi = ema(period, ndms);

    // Calculate the Directional Movement Index (DX)
    const dxs = plusDi.map((plusDiValue, i) => {
        const minusDiValue = minusDi[i];
        const sumDi = Math.abs(plusDiValue - minusDiValue);
        const divDi = plusDiValue + minusDiValue;
        return divDi !== 0 ? (sumDi / divDi) * 100 : 0; // Avoid division by zero
    });

    // Finally, calculate the ADX
    const adx = ema(period, dxs)[ema(period, dxs).length - 1];

    // *** Improved Signal Logic (Example) ***
    // This is a basic example; refine based on your strategy
    const trendStrengthThreshold = 25; // Adjust as needed
    let signal = Signal.Hold; // 0: Neutral, 1: Buy, -1: Sell

    if (adx > trendStrengthThreshold) {
        if (plusDi[plusDi.length - 1] > minusDi[minusDi.length - 1]) {
            signal = Signal.Sell; // Strong uptrend
        } else {
            signal = Signal.Buy; // Strong downtrend
        }
    }

    return signal;
};
