export type MarketSentiments = "bullish" | "bearish" | "neutral";

export type MarketSentimentFull = "bullish" | "bearish" | "neutral" | "very bullish" | "very bearish";

export type MarketIndications = "buy" | "sell" | "neutral" | "overbought" | "oversold";

export type OrderTypes = "buy" | "sell" | "hold";

export interface cornData {
    globalSentiment: MarketSentiments,
    niftySentiment: MarketSentimentFull,
    pcr: MarketIndications,
}
