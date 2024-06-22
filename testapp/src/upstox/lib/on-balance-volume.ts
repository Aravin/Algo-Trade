import { Position } from "./enums/position.enum";
import { Signal } from "./enums/signals.enum";
import { Candle } from "./types/candle.types";

const calculateOBV = (candles: Candle[]): number[] => {
    const obv: number[] = [0];

    for (let i = 1; i < candles.length; i++) {
        const [, , , , closeCurrent, volumeCurrent] = candles[i];
        const [, , , , closePrevious] = candles[i - 1];

        if (closeCurrent > closePrevious) {
            obv.push(obv[i - 1] + volumeCurrent);
        } else if (closeCurrent < closePrevious) {
            obv.push(obv[i - 1] - volumeCurrent);
        } else {
            obv.push(obv[i - 1]);
        }
    }

    return obv;
};

const generateSignals = (candles: Candle[]): Signal[] => {
    const obvValues = calculateOBV(candles);
    const signals: Signal[] = [Signal.Hold]; // Start with a "Hold" signal

    // --- STRATEGY 2: OBV Divergence (More Advanced) ---
    for (let i = 2; i < candles.length; i++) {
        const priceHigherHigh = candles[i][4] > candles[i - 1][4] && candles[i - 1][4] > candles[i - 2][4];
        const obvLowerHigh = obvValues[i] < obvValues[i - 1] && obvValues[i - 1] < obvValues[i - 2];

        const priceLowerLow = candles[i][4] < candles[i - 1][4] && candles[i - 1][4] < candles[i - 2][4];
        const obvHigherLow = obvValues[i] > obvValues[i - 1] && obvValues[i - 1] > obvValues[i - 2];

        if (priceHigherHigh && obvLowerHigh) { // Bearish Divergence
            signals.push(Signal.Sell);
        } else if (priceLowerLow && obvHigherLow) { // Bullish Divergence
            signals.push(Signal.Buy);
        } else {
            signals.push(Signal.Hold);
        }
    }

    return signals;
};

const generateSignalsIfOrderIsOpen = (
    candles: Candle[],
    currentPos: Position = Position.None
): Signal[] => {
    const obvValues = calculateOBV(candles);
    const signals: Signal[] = [Signal.Hold];

    // ... (Choose your OBV strategy - Crossover or Divergence from before)

    for (let i = 2; i < candles.length; i++) {
        // ... (Your OBV signal logic - same as before)

        // Position Management:
        // ==== Position Management ====
        if (currentPos === Position.None) {
            if (obvValues[i] > obvValues[i - 1] && candles[i][4] > candles[i - 1][4]) {
                signals.push(Signal.Buy);
            } else if (obvValues[i] < obvValues[i - 1] && candles[i][4] < candles[i - 1][4]) {
                signals.push(Signal.Sell);
            } else {
                signals.push(Signal.Hold);
            }
        } else if (currentPos === Position.Long) {
            if (obvValues[i] < obvValues[i - 1] && candles[i][4] < candles[i - 1][4]) {
                signals.push(Signal.Sell);
            } else {
                signals.push(Signal.Hold);
            }
        } else if (currentPos === Position.Short) {
            if (obvValues[i] > obvValues[i - 1] && candles[i][4] > candles[i - 1][4]) {
                signals.push(Signal.Buy);
            } else {
                signals.push(Signal.Hold);
            }
        }
    }

    return signals;
};