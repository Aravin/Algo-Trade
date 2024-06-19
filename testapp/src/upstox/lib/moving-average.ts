// upstox - https://upstox.com/developer/api-documentation/get-intra-day-candle-data

import { Candle } from "./candle-types";

export const ema = (period: number, candles: Candle[]) => {
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