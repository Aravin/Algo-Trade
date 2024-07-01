// upstox - https://upstox.com/developer/api-documentation/get-intra-day-candle-data

import { Signal } from "./enums/signal.enum";
import { Candle } from "./types/candle.types";


export const ema = (period: number, data: number[]): number[] => {
  if (period <= 0 || period > data.length) {
    throw new Error(`Invalid period ${period}. Please enter a positive number less than or equal to the data length ${data.length}.`);
  }

  // Use only the top 'period' number of data points
  data = data.slice(0, period);

  const emaValues: number[] = [data[0]]; // Initialize with the first data point
  const k = 2 / (period + 1); // Weighting factor

  for (let i = 1; i < data.length; i++) {
    const emaValue = (data[i] * k) + (emaValues[i - 1] * (1 - k));
    emaValues.push(emaValue);
  }

  return emaValues;
};

const calculateCurrentEMA = (previousEMA: number, currentPrice: number, k: number): number => {
  return (currentPrice * k) + (previousEMA * (1 - k));
};

export const currentEmaCrossoverSignal = (candles: Candle[], fastPeriod: number, slowPeriod: number): Signal => {
  if (candles?.length < slowPeriod) {
    throw new Error("Not enough data for EMA calculation.");
  }

  const closingPrices = candles.map(candle => candle[4]);
  const lastIndex = candles.length - 1;

  // Calculate the weighting factors
  const fastK = 2 / (fastPeriod + 1);
  const slowK = 2 / (slowPeriod + 1);

  // Initialize EMAs with the first closing price
  let fastEMA = closingPrices[0];
  let slowEMA = closingPrices[0];

  // Calculate EMAs iteratively, only keeping track of the previous values
  for (let i = 1; i <= lastIndex; i++) {
    fastEMA = calculateCurrentEMA(fastEMA, closingPrices[i], fastK);
    slowEMA = calculateCurrentEMA(slowEMA, closingPrices[i], slowK);
  }

  // Store the previous EMA values before updating
  const prevFastEMA = calculateCurrentEMA(fastEMA, closingPrices[lastIndex - 1], fastK);
  const prevSlowEMA = calculateCurrentEMA(slowEMA, closingPrices[lastIndex - 1], slowK);

  if (fastEMA > slowEMA && prevFastEMA <= prevSlowEMA) {
    return Signal.Buy;
  } else if (fastEMA < slowEMA && prevFastEMA >= prevSlowEMA) {
    return Signal.Sell;
  } else {
    return Signal.Hold;
  }
};