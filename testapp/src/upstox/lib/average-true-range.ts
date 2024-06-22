// Function to calculate Average True Range (ATR) for a given period
export const currentAtr = (period: number, candles: any[]) => {
    // Check for valid period
    if (period <= 0 || period > candles.length) {
        throw new Error("Invalid period. Please enter a positive number less than or equal to the data length.");
    }

    // Variables for ATR calculation
    let prevTr = 0; // Stores previous True Range (TR)
    let prevAtr = 0; // Stores previous ATR

    // Loop through candles, calculating TR and updating ATR
    for (let i = Math.max(candles.length - period, 0); i < candles.length; i++) {
        const currentCandle = candles[i];
        const currentTr = trueRange(currentCandle); // Current True Range

        // Calculate ATR using Wilder's smoothing
        if (i < period) {
            // Use simple average for the first 'period' candles
            prevAtr = (prevAtr * i + currentTr) / (i + 1);
        } else {
            prevAtr = prevTr + (currentTr - prevTr) * (1 / period);
        }

        prevTr = currentTr; // Update previous TR for next iteration
    }

    return prevAtr;
};

// Function to calculate True Range (TR) for a single candle
const trueRange = (candle) => {
    const highLow = candle[2] - candle[3]; // High - Low
    const closePrev = Math.abs(candle[4] - candle[1]); // Close - Open (previous candle)
    return Math.max(highLow, closePrev);
};

// Function to assess market volatility based on ATR
export const AtrVolatility = (atr: number, thresholdHigh: number, thresholdLow: number = 0): string => {
    if (atr >= thresholdHigh) {
        return "Volatile";
    } else if (atr <= thresholdLow) {
        return "Non-volatile";
    } else {
        return "Neutral";
    }
};