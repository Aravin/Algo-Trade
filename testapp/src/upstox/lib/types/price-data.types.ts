export interface PriceData {
    ltp: number;  // Last Traded Price
    ltt: string;  // Last Traded Time (likely Unix timestamp in milliseconds)
    ltq: string;  // Last Traded Quantity
    cp: number;   // Close Price 
};
