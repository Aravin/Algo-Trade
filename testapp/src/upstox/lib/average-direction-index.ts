// Function to calculate True Range (TR) for a single candle
const trueRange = (candle) => {
    const highLow = candle[2] - candle[3]; // High - Low
    const closePrev = Math.abs(candle[4] - candle[1]); // Close - Open (previous candle)
    return Math.max(highLow, closePrev);
};

// Placeholder function for EMA (replace with your actual implementation)
const ema = (period: number, values: number[]) => {
    throw new Error("EMA function not implemented. Please provide your EMA implementation.");
};

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

// Function to calculate Average Directional Index (ADX) for current time (period 14)
export const currentAdx14 = (candles: any[]) => {
    const period = 14; // Fixed period for ADX(14)

    // Check for valid period
    if (period <= 0 || period > candles.length) {
        throw new Error("Invalid period. Please enter a positive number less than or equal to the data length.");
    }

    // Initialize variables
    const pdms = new Array(candles.length).fill(0); // Positive Directional Movements
    const ndms = new Array(candles.length).fill(0); // Negative Directional Movements

    // Calculate True Range (TR) for each candle (assuming you have a separate function for ATR calculation)
    const trs = candles.map(() => currentAtr(period, candles)); // Replace with your ATR calculation logic

    // Calculate Positive Directional Movement (PDM)
    for (let i = 1; i < candles.length; i++) {
        const currentClose = candles[i][4];
        const prevClose = candles[i - 1][4];
        const prevPdm = pdms[i - 1];
        pdms[i] = Math.max(0, Math.max(currentClose - prevClose, 0) - (prevClose - candles[i - 1][3])); // Max(Current-Prev, 0) - Max(Prev-Low, 0)
    }

    // Calculate Negative Directional Movement (NDM)
    for (let i = 1; i < candles.length; i++) {
        const currentClose = candles[i][4];
        const prevClose = candles[i - 1][4];
        const prevNdm = ndms[i - 1];
        ndms[i] = Math.max(0, Math.max(prevClose - currentClose, 0) - (currentClose - candles[i - 1][2])); // Max(Prev-Current, 0) - Max(Current-High, 0)
    }

    // Calculate Smoothed Positive Directional Indicator (DI+) and Smoothed Negative Directional Indicator (DI-) using EMA (replace with your EMA function)
    const plusDi = ema(period, pdms.slice(period - 1)); // EMA of PDMs from period-1 onwards (excluding initial values)
    const minusDi = ema(period, ndms.slice(period - 1));

    // Calculate ADX values
    const adxValues = new Array(candles.length).fill(null);
    for (let i = period; i < candles.length; i++) {
        const prevAdx = adxValues[i - 1] || 0; // Previous ADX or 0 for initial values
        const numerator = Math.abs(plusDi[i - period] - minusDi[i - period]);
        const denominator = trs.slice(i - period, i).reduce((sum, tr) => sum + tr, 0); // Sum of TR for the previous period

        if (denominator === 0) {
            adxValues[i] = prevAdx; // Avoid division by zero (use previous ADX)
        } else {
            adxValues[i] = ((numerator / denominator) * 100 + prevAdx * (period - 1)) / period;
        }
    }

    // Return the ADX value for the current time (last element of adxValues)
    return adxValues[adxValues.length - 1];
};