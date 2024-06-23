import { ema } from "./moving-average";
import { Candle } from "./types/candle.types";

const calculateStochasticOscillator = (candles: Candle[], period: number = 14, smoothing: number = 3): { k: number, d: number } => {
  if (candles.length < period) {
    throw new Error("Not enough candle data to calculate Stochastic Oscillator.");
  }

  const kValues: number[] = [];

  // Calculate %K for each candle within the period
  for (let i = period - 1; i < candles.length; i++) {
    const highestHigh = Math.max(...candles.slice(i - period + 1, i + 1).map(candle => candle[2])); // Highest high in period
    const lowestLow = Math.min(...candles.slice(i - period + 1, i + 1).map(candle => candle[3]));   // Lowest low in period
    const currentClose = candles[i][4];

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    kValues.push(k);
  }

  // Calculate %D (smoothed %K)
  const dValues: number[] = ema(smoothing, kValues); // Use your existing EMA function 

  return {
    k: kValues[kValues.length - 1],
    d: dValues[dValues.length - 1]
  };
};

// Function to generate buy/sell signals from the Stochastic Oscillator
export const stochasticSignal = (candles: Candle[], period: number = 14, smoothing: number = 3): string => {
  const kValues: number[] = [];
  const dValues: number[] = [];

  // Calculate %K for each candle within the period
  for (let i = period - 1; i < candles.length; i++) {
    const highestHigh = Math.max(...candles.slice(i - period + 1, i + 1).map(candle => candle[2]));
    const lowestLow = Math.min(...candles.slice(i - period + 1, i + 1).map(candle => candle[3]));
    const currentClose = candles[i][4];

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    kValues.push(k);
  }

  // Calculate %D (smoothed %K)
  dValues.push(...ema(smoothing, kValues));

  const { k, d } = calculateStochasticOscillator(candles, period, smoothing);

  const overboughtThreshold = 80;
  const oversoldThreshold = 20;

  if (k > d && k < oversoldThreshold && kValues[kValues.length - 2] <= dValues[dValues.length - 2]) {
    return "Buy";
  }

  if (k < d && k > overboughtThreshold && kValues[kValues.length - 2] >= dValues[dValues.length - 2]) {
    return "Sell";
  }

  return "Hold";
};

const getStochasticSignalWithPosition = (candles: Candle[],
  positionType: string,  // Add position type parameter
  period: number = 14,
  smoothing: number = 3): string => {

  const kValues: number[] = [];
  const dValues: number[] = [];

  // Calculate %K for each candle within the period
  for (let i = period - 1; i < candles.length; i++) {
    const highestHigh = Math.max(...candles.slice(i - period + 1, i + 1).map(candle => candle[2]));
    const lowestLow = Math.min(...candles.slice(i - period + 1, i + 1).map(candle => candle[3]));
    const currentClose = candles[i][4];

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    kValues.push(k);
  }

  // Calculate %D (smoothed %K)
  dValues.push(...ema(smoothing, kValues));

  const { k, d } = calculateStochasticOscillator(candles, period, smoothing);

  const overboughtThreshold = 80;
  const oversoldThreshold = 20;

  // *** Adjust signal logic based on position type ***
  switch (positionType) {
    case "long call":
      if (k < d && k > overboughtThreshold) {
        return "Consider taking profits or tightening stop-loss"; // Potential to sell
      } else if (k > d && k < oversoldThreshold) {
        return "Hold or consider adding to position"; // Potential dip to buy more 
      }
      break;
    case "short call":
      if (k < d && k > overboughtThreshold) {
        return "Hold or consider adding to position"; // Price moving against you
      } else if (k > d && k < oversoldThreshold) {
        return "Consider taking profits or reducing position"; // Price moving in your favor
      }
      break;
    case "long put":
      if (k > d && k < oversoldThreshold) {
        return "Consider taking profits or tightening stop-loss"; // Potential to sell
      } else if (k < d && k > overboughtThreshold) {
        return "Hold or consider adding to position"; // Potential bounce to buy more
      }
      break;
    case "short put":
      if (k > d && k < oversoldThreshold) {
        return "Hold or consider adding to position"; // Price moving against you
      } else if (k < d && k > overboughtThreshold) {
        return "Consider taking profits or reducing position"; // Price moving in your favor
      }
      break;
    default:
      // If no position or invalid position type, use the general Stochastic signals
      if (k > d && k < oversoldThreshold && kValues[kValues.length - 2] <= dValues[dValues.length - 2]) {
        return "Buy";
      }
      if (k < d && k > overboughtThreshold && kValues[kValues.length - 2] >= dValues[dValues.length - 2]) {
        return "Sell";
      }
  }

  return "Hold"; // Default to hold if no clear signal
};

