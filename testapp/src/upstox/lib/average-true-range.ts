import { Candle } from "./types/candle.types";
import { Volatility } from "./enums/volatility.enum";

// Function to calculate Average True Range (ATR) for a given period
export const currentAtr = (candles: Candle[], period: number) => {
    // Check for valid period
    if (period <= 0 || period > candles.length) {
        throw new Error("Invalid period. Please enter a positive number less than or equal to the data length.");
    }

    candles = candles.slice(0, period);

    // Calculate True Range (TR) for the initial period
    let trueRanges = candles.slice(candles.length - period).map(trueRange);

    // Initial ATR is the average of the first 'period' TR values
    let atr = trueRanges.reduce((sum, tr) => sum + tr, 0) / period;

    // Loop through candles, calculating TR and updating ATR
    for (let i = Math.max(candles.length - period, 0); i < candles.length; i++) {
        const currentTr = trueRange(candles[i]);
        atr = (atr * (period - 1) + currentTr) / period;
    }

    return atr;
};

// Function to calculate True Range (TR) for a single candle
const trueRange = (candle: Candle) => {
    const highLow = candle[2] - candle[3]; // High - Low
    const closePrev = Math.abs(candle[4] - candle[1]); // Close - Open (previous candle)
    return Math.max(highLow, closePrev);
};

// Function to assess market volatility based on ATR
export const atrVolatility = (candles: Candle[], period: number, thresholdHigh: number, thresholdLow: number = 0): string => {

    const atr = currentAtr(candles, period);

    if (atr >= thresholdHigh) {
        return Volatility.High;
    } else if (atr <= thresholdLow) {
        return Volatility.Low;
    } else {
        return Volatility.Neutral;
    }
};