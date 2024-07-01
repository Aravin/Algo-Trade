import { Signal } from "./enums/signal.enum";
import { Trend } from "./enums/trend.enum";
import { Candle } from "./types/candle.types";

// Function to calculate Bollinger Bands
const calculateBollingerBands = (candles: Candle[], period: number = 20, stdDevMultiplier: number = 2): { middle: number, upper: number, lower: number } => {
  if (candles.length < period) {
    throw new Error("Not enough candle data to calculate Bollinger Bands.");
  }

  const initialCandles = candles.slice(0, period); // Get the first 'period' candles
  const closingPrices = initialCandles.map(candle => candle[4]);

  // Calculate SMA (middle band)
  const sma = closingPrices.reduce((sum, price) => sum + price, 0) / period;

  // Calculate standard deviation 
  const stdDev = Math.sqrt(closingPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period);

  // Calculate upper and lower bands
  const upper = sma + stdDev * stdDevMultiplier;
  const lower = sma - stdDev * stdDevMultiplier;

  return { middle: sma, upper, lower }; // Return single values, not arrays
};

// Function to calculate Bollinger Bands and generate signals
export const bollingerBandsSignals = (
  candles: Candle[],
  period: number = 20,
): { signal: Signal, trend: Trend } => {
  const { middle, upper, lower } = calculateBollingerBands(candles, period);

  let signal = Signal.Hold; // Buy/Sell Signal
  let trend = Trend.Neutral; // Trend Assessment

  // Iterate through candles *after* the initial 'period' candles
  for (let i = period; i < candles.length; i++) {
    const currentPrice = candles[i][4];

    // Buy/Sell Signals based on initial Bollinger Bands
    if (currentPrice > upper) {
      signal = Signal.Buy;
    } else if (currentPrice < lower) {
      signal = Signal.Sell;
    }

    // Trend Assessment based on initial middle band
    if (currentPrice > middle) {
      trend = Trend.Up;
    } else if (currentPrice < middle) {
      trend = Trend.Down;
    }

    console.log(`Candle ${i}: Price: ${currentPrice}, Signal: ${signal}, Trend: ${trend}`);
  }

  return { signal, trend };
};

// Function to calculate Bollinger Bands and generate signals (enhanced with order status)
export const calculateBollingerBandsSignalsEnhanced = (
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2,
  orderStatus: string = "none"
): { middle: number[], upper: number[], lower: number[], signal: string, trend: string } => {

  if (candles.length < period) {
    throw new Error("Not enough candle data to calculate Bollinger Bands.");
  }

  const closingPrices = candles.map(candle => candle[4]);

  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    const periodData = closingPrices.slice(i - period + 1, i + 1);

    const sma = periodData.reduce((sum, price) => sum + price, 0) / period;
    middle.push(sma);

    const stdDev = Math.sqrt(periodData.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period) * stdDevMultiplier;

    upper.push(sma + stdDev);
    lower.push(sma - stdDev);
  }

  // *** Signal and Trend Assessment ***
  let signal = "Hold";
  let trend = "Neutral";

  const currentPrice = closingPrices[closingPrices.length - 1];

  // 1. Buy/Sell Signals (based on breakouts):
  if (currentPrice > upper[upper.length - 1]) {
    signal = "Buy";
  } else if (currentPrice < lower[lower.length - 1]) {
    signal = "Sell";
  }

  // 2. Trend Assessment (based on price relative to middle band):
  if (currentPrice > middle[middle.length - 1]) {
    trend = "Uptrend";
  } else if (currentPrice < middle[middle.length - 1]) {
    trend = "Downtrend";
  }

  // *** Adjust signal based on order status ***
  if (orderStatus === "buy") {
    if (signal === "Sell") {
      // Example logic: Set a stop-loss order below the lower band
      signal = "Set Stop-Loss";
    }
  } else if (orderStatus === "sell") {
    if (signal === "Buy") {
      // Example logic: Set a stop-loss order above the upper band
      signal = "Set Stop-Loss";
    }
  }

  return { middle, upper, lower, signal, trend };
};

// export const bollingerBandWidth = (candles: Candle[], period: number = 20): number[] => {
//   const { upper, lower } = bollingerBandsSignals(candles, period);
//   const bandWidth: number[] = [];

//   for (let i = 0; i < upper.length; i++) {
//       bandWidth.push(upper[i] - lower[i]); 
//   }

//   return bandWidth;
// };


// console.log("Bollinger Bands:");
// // ... (Print middle, upper, lower bands)

// console.log("Buy/Sell Signal:", bollingerBandsData.signal);
// console.log("Trend:", bollingerBandsData.trend);