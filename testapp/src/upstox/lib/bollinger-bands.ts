import { Candle } from "./candle-types";

// Function to calculate Bollinger Bands
export const calculateBollingerBands = (candles: Candle[], period: number = 20, stdDevMultiplier: number = 2): { middle: number[], upper: number[], lower: number[] } => {
  if (candles.length < period) {
    throw new Error("Not enough candle data to calculate Bollinger Bands.");
  }

  const closingPrices = candles.map(candle => candle[4]); // Extract closing prices

  const middle: number[] = []; // Middle band (SMA)
  const upper: number[] = []; // Upper band
  const lower: number[] = []; // Lower band

  for (let i = period - 1; i < candles.length; i++) {
    const periodData = closingPrices.slice(i - period + 1, i + 1); // Get data for the current period

    // Calculate Simple Moving Average (SMA) for the middle band
    const sma = periodData.reduce((sum, price) => sum + price, 0) / period;
    middle.push(sma);

    // Calculate standard deviation
    const stdDev = Math.sqrt(periodData.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period);

    // Calculate upper and lower bands
    upper.push(sma + stdDev * stdDevMultiplier);
    lower.push(sma - stdDev * stdDevMultiplier);
  }

  return { middle, upper, lower };
};

// Function to calculate Bollinger Bands and generate signals
export const calculateBollingerBandsSignals = (
  candles: Candle[],
  period: number = 20,
): { middle: number[], upper: number[], lower: number[], signal: string, trend: string } => {
  const { middle, upper, lower } = calculateBollingerBands(candles, period);

  // *** Signal and Trend Assessment ***
  let signal = "Hold"; // Buy/Sell Signal
  let trend = "Neutral"; // Trend Assessment

  const closingPrices = candles.map(candle => candle[4]); // Extract closing prices
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

  return { middle, upper, lower, signal, trend };
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

const calculateBollingerBandWidth = (candles: Candle[], period: number = 20): number[] => {
  const { upper, lower } = calculateBollingerBandsSignals(candles, period);
  const bandWidth: number[] = [];

  for (let i = 0; i < upper.length; i++) {
      bandWidth.push(upper[i] - lower[i]); 
  }

  return bandWidth;
};


// console.log("Bollinger Bands:");
// // ... (Print middle, upper, lower bands)

// console.log("Buy/Sell Signal:", bollingerBandsData.signal);
// console.log("Trend:", bollingerBandsData.trend);