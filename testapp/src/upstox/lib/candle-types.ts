export type Candle = [
    string,  // Timestamp
    number,  // Open
    number,  // High
    number,  // Low
    number,  // Close (can be renamed to ClosingPrice for clarity)
    number,  // Volume
    number,  // Open Interest
];