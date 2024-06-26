import { Signal } from './enums/signal.enum';
import { OptionData } from './types/option.types';

// Function to calculate PCR for a given expiry date
const calculateVolumePCR = (optionsChain: OptionData[]): number => {
    let totalPutVolume = 0;
    let totalCallVolume = 0;

    for (const option of optionsChain) {
        totalPutVolume += option.put_options.market_data.volume;
        totalCallVolume += option.call_options.market_data.volume;
    }

    if (totalCallVolume === 0) {
        return 0; // Handle division by zero appropriately
    }

    return totalPutVolume / totalCallVolume;
};

// Function to calculate the overall PCR for the entire options chain (from Open Interest)
export const calculateOiPcr = (optionsChain: OptionData[]): number => {
    let totalPutOI = 0;
    let totalCallOI = 0;

    for (const option of optionsChain) {
        totalPutOI += option.put_options.market_data.oi;
        totalCallOI += option.call_options.market_data.oi;
    }

    if (totalCallOI === 0) {
        return 0; // Handle division by zero appropriately 
    }

    return totalPutOI / totalCallOI;
};

// open interest - put call ratio - signal
export const oiPcrSignal = (optionsChain: OptionData[]): Signal => {
    const overallPCR = calculateOiPcr(optionsChain);
    let threshold = 1;
    let highThreshold = 1.5;
    let lowThreshold = 0.5;

    // Check for Exit signal first
    if (overallPCR > highThreshold || overallPCR < lowThreshold) {
        return Signal.Exit;
    } else if (overallPCR < threshold) {
        return Signal.Buy;
    } else if (overallPCR > threshold) {
        return Signal.Sell;
    } else {
        return Signal.Hold;
    }
};

// Example usage:
// const calculatedPCR = calculateOiPcr(optionsChainData.data);
// console.log(`Calculated PCR for expiry : ${calculatedPCR}`);