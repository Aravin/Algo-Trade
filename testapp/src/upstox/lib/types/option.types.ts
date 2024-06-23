export interface OptionData {
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