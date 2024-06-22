// upstox - https://upstox.com/developer/api-documentation/get-intra-day-candle-data

import { Candle } from "./candle-types";

export const ema = (period: number, data: number[]): number[] => {
    if (period <= 0 || period > data.length) {
        throw new Error("Invalid period. Please enter a positive number less than or equal to the data length.");
    }

    const emaValues: number[] = [data[0]]; // Initialize with the first data point
    const k = 2 / (period + 1); // Weighting factor

    for (let i = 1; i < data.length; i++) {
        const emaValue = (data[i] * k) + (emaValues[i - 1] * (1 - k));
        emaValues.push(emaValue);
    }

    return emaValues;
};

export const emalast = (period: number, candles: Candle[]) => {
    // Check for valid period
    if (period <= 0 || period > candles.length) {
        throw new Error("Invalid period. Please enter a positive number less than or equal to the data length.");
    }

    // Initialize variables
    const lastCandle = candles[candles.length - 1]; // Access the most recent candle
    const closingPrice = lastCandle[4]; // Access closing price at index 4
    let prevEma = closingPrice; // Initial EMA (use closing price for first candle)
    const k = 2 / (period + 1); // Weighting factor

    // Calculate EMA only for the most recent candle
    const emaValue = k * closingPrice + (1 - k) * prevEma;

    return emaValue;
}

// Function to generate a buy/sell signal for the last candle based on EMA crossover
export const currentEmaCrossoverSignal = (candles: any[], fastPeriod: number, slowPeriod: number): number => {
    if (candles.length < slowPeriod) {
        throw new Error("Not enough data for EMA calculation.");
    }

    const closingPrices = candles.map(candle => candle[4]); // Extract closing prices
    const fastEMA = ema(fastPeriod, closingPrices);
    const slowEMA = ema(slowPeriod, closingPrices);
    const lastIndex = candles.length - 1;

    if (fastEMA[lastIndex] > slowEMA[lastIndex] && fastEMA[lastIndex - 1] <= slowEMA[lastIndex - 1]) {
        return 1; // Buy signal 
    } else if (fastEMA[lastIndex] < slowEMA[lastIndex] && fastEMA[lastIndex - 1] >= slowEMA[lastIndex - 1]) {
        return -1; // Sell signal
    } else {
        return 0; // No signal
    }
};

// sample data
/**
const candles = [
    [
        "2023-10-19T15:15:00+05:30",
        2305.3,
        2307.05,
        2301,
        2304.65,
        559982,
        0
    ],
    [
        "2023-10-19T14:45:00+05:30",
        2309.1,
        2310.75,
        2305.25,
        2305.3,
        740124,
        0
    ]
];
 */