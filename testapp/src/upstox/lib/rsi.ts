import { Candle } from "./types/candle.types";

export const calculateRsi = (candles: Candle[], period: number = 14): number => {
  if (candles.length < period) {
    throw new Error("Not enough data to calculate RSI. Candle array length must be greater than or equal to the period.");
  }

  let gains = 0;
  let losses = 0;

  // Calculate initial gains and losses
  for (let i = 1; i <= period; i++) {
    const priceChange = candles[i][4] - candles[i - 1][4]; // Change in closing prices
    if (priceChange >= 0) {
      gains += priceChange;
    } else {
      losses -= priceChange; // Subtract to make it a positive value
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI for subsequent candles
  for (let i = period + 1; i < candles.length; i++) {
    const priceChange = candles[i][4] - candles[i - 1][4];
    if (priceChange >= 0) {
      avgGain = ((avgGain * (period - 1)) + priceChange) / period;
      avgLoss = ((avgLoss * (period - 1)) + 0) / period; // No loss on an up day
    } else {
      avgGain = ((avgGain * (period - 1)) + 0) / period;  // No gain on a down day
      avgLoss = ((avgLoss * (period - 1)) - priceChange) / period;
    }
  }

  if (avgLoss === 0) {
    return 100; // Avoid division by zero, RSI is 100 when there are no losses
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return rsi;
};

// Function to determine overbought, oversold, or hold signal based on RSI
export const rsiSignal = (candles: Candle[], period: number = 14, overboughtThreshold: number = 70, oversoldThreshold: number = 30): string => {

  const rsi = calculateRsi(candles, period);

  if (rsi >= overboughtThreshold) {
    return "Overbought";
  } else if (rsi <= oversoldThreshold) {
    return "Oversold";
  } else {
    return "Hold";
  }
};

// Enhanced function to generate an RSI signal, taking into account holding positions
export const getRSISignalWithPosition = (candles: Candle[], period: number = 14,
  positionType: string,
  overboughtThreshold: number = 70,
  oversoldThreshold: number = 30): string => {

  const generalSignal = rsiSignal(candles, period, overboughtThreshold, oversoldThreshold);

  // Adjust signal based on position type
  switch (positionType) {
    case "long call":
      if (generalSignal === "Overbought") {
        return "Consider taking profits or tightening stop-loss"; // Potential to sell
      } else if (generalSignal === "Oversold") {
        return "Hold or consider adding to position"; // Potential dip to buy
      }
      break;
    case "short call":
      if (generalSignal === "Overbought") {
        return "Hold or consider adding to position"; // Price moving against you
      } else if (generalSignal === "Oversold") {
        return "Consider taking profits or reducing position"; // Price moving in your favor
      }
      break;
    case "long put":
      if (generalSignal === "Overbought") {
        return "Consider taking profits or reducing position"; // Price moving against you
      } else if (generalSignal === "Oversold") {
        return "Hold or consider adding to position"; // Price moving in your favor
      }
      break;
    case "short put":
      if (generalSignal === "Overbought") {
        return "Hold or consider adding to position"; // Price moving in your favor
      } else if (generalSignal === "Oversold") {
        return "Consider taking profits or tightening stop-loss"; // Price moving against you
      }
      break;
    default:
      return generalSignal; // Default to the general signal if no position or invalid type
  }

  return "Hold"; // Default to "Hold" if no adjustment was made 
};

