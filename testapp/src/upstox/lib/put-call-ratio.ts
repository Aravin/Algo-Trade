interface OptionData {
    expiry: string;
    pcr: number; // Pre-calculated PCR - we'll ignore this for our calculation
    strike_price: number;
    underlying_key: string;
    underlying_spot_price: number;
    call_options: OptionDetails;
    put_options: OptionDetails;
}

interface OptionDetails {
    instrument_key: string;
    market_data: {
        ltp: number;
        volume: number;
        oi: number;
        // ... (other market data fields)
    };
    option_greeks: {
        // ... (option greeks data)
    };
}

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

export const oiPcrSignal = (optionsChain: OptionData[],
    buyThreshold = 0.80,
    sellThreshold = 1.20): number => {

    const overallPCR = calculateOiPcr(optionsChain);

    if (overallPCR < buyThreshold) {
        return 1; // Buy signal
    } else if (overallPCR > sellThreshold) {
        return -1; // Sell signal
    } else {
        return 0; // Neutral (no signal)
    }
};

// Example usage:
// const calculatedPCR = calculateOiPcr(optionsChainData.data);
// console.log(`Calculated PCR for expiry : ${calculatedPCR}`);