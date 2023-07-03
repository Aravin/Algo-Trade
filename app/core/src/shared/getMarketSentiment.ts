export const getMarketSentiment = (global: string, local: string, pcr: string): string | null => {
    const globalMap = globalNiftyMapping.find(
        (v) => v.globalSentiment === global && v.marketSentiment === local);

    const canTrade = globalMap?.canTrade || 0;

    if (canTrade) {
        const strategyMap = marketStrategyMapping.find(
            (v) => v.marketSentiment === local && v.putCallRatio == pcr);

        return (strategyMap?.orderType || null);
    }

    return null;
}

const globalNiftyMapping = [
    {
        "globalSentiment": "bearish",
        "marketSentiment": "very bearish",
        "canTrade": 1
    },
    {
        "globalSentiment": "bearish",
        "marketSentiment": "bearish",
        "canTrade": 1
    },
    {
        "globalSentiment": "bearish",
        "marketSentiment": "neutral",
        "canTrade": 1
    },
    {
        "globalSentiment": "bearish",
        "marketSentiment": "bullish",
        "canTrade": 0
    },
    {
        "globalSentiment": "bearish",
        "marketSentiment": "very bullish",
        "canTrade": 0
    },
    {
        "globalSentiment": "neutral",
        "marketSentiment": "very bearish",
        "canTrade": 1
    },
    {
        "globalSentiment": "neutral",
        "marketSentiment": "bearish",
        "canTrade": 1
    },
    {
        "globalSentiment": "neutral",
        "marketSentiment": "neutral",
        "canTrade": 1
    },
    {
        "globalSentiment": "neutral",
        "marketSentiment": "bullish",
        "canTrade": 1
    },
    {
        "globalSentiment": "neutral",
        "marketSentiment": "very bullish",
        "canTrade": 1
    },
    {
        "globalSentiment": "bullish",
        "marketSentiment": "very bearish",
        "canTrade": 0
    },
    {
        "globalSentiment": "bullish",
        "marketSentiment": "bearish",
        "canTrade": 0
    },
    {
        "globalSentiment": "bullish",
        "marketSentiment": "neutral",
        "canTrade": 1
    },
    {
        "globalSentiment": "bullish",
        "marketSentiment": "bullish",
        "canTrade": 1
    },
    {
        "globalSentiment": "bullish",
        "marketSentiment": "very bullish",
        "canTrade": 1
    }
];

const marketStrategyMapping = [
    {
        "marketSentiment": "very bearish",
        "putCallRatio": "oversold",
        "orderType": "buy",
        "strategy": "Bear PUT Spread"
    },
    {
        "marketSentiment": "bearish",
        "putCallRatio": "oversold",
        "orderType": "buy",
        "strategy": "Bear PUT Spread"
    },
    {
        "marketSentiment": "neutral",
        "putCallRatio": "oversold",
        "orderType": "buy",
        "strategy": "Long Straddle"
    },
    {
        "marketSentiment": "bullish",
        "putCallRatio": "oversold",
        "orderType": "buy",
        "strategy": "Bull CALL Spread"
    },
    {
        "marketSentiment": "very bullish",
        "putCallRatio": "oversold",
        "orderType": "buy",
        "strategy": "Bull CALL Spread"
    },
    {
        "marketSentiment": "very bearish",
        "putCallRatio": "sell",
        "orderType": "sell",
        "strategy": "Bear PUT Spread"
    },
    {
        "marketSentiment": "bearish",
        "putCallRatio": "sell",
        "orderType": "sell",
        "strategy": "Bear PUT Spread"
    },
    {
        "marketSentiment": "neutral",
        "putCallRatio": "sell",
        "orderType": "sell",
        "strategy": "Short Straddle"
    },
    {
        "marketSentiment": "bullish",
        "putCallRatio": "sell",
        "orderType": "sell",
        "strategy": null
    },
    {
        "marketSentiment": "very bullish",
        "putCallRatio": "sell",
        "orderType": "sell",
        "strategy": null
    },
    {
        "marketSentiment": "very bearish",
        "putCallRatio": "neutral",
        "orderType": "sell",
        "strategy": "Bear PUT Spread"
    },
    {
        "marketSentiment": "bearish",
        "putCallRatio": "neutral",
        "orderType": "sell",
        "strategy": "Bear PUT Spread"
    },
    {
        "marketSentiment": "neutral",
        "putCallRatio": "neutral",
        "orderType": "hold",
        "strategy": "Short Strangle"
    },
    {
        "marketSentiment": "bullish",
        "putCallRatio": "neutral",
        "orderType": "buy",
        "strategy": "Bull CALL Spread"
    },
    {
        "marketSentiment": "very bullish",
        "putCallRatio": "neutral",
        "orderType": "buy",
        "strategy": "Bull CALL Spread"
    },
    {
        "marketSentiment": "very bearish",
        "putCallRatio": "buy",
        "orderType": "buy",
        "strategy": null
    },
    {
        "marketSentiment": "bearish",
        "putCallRatio": "buy",
        "orderType": "buy",
        "strategy": null
    },
    {
        "marketSentiment": "neutral",
        "putCallRatio": "buy",
        "orderType": "buy",
        "strategy": "Long Straddle"
    },
    {
        "marketSentiment": "bullish",
        "putCallRatio": "buy",
        "orderType": "buy",
        "strategy": "Bull CALL Spread"
    },
    {
        "marketSentiment": "very bullish",
        "putCallRatio": "buy",
        "orderType": "buy",
        "strategy": "Bull CALL Spread"
    },
    {
        "marketSentiment": "very bearish",
        "putCallRatio": "overbought",
        "orderType": "sell",
        "strategy": "Bear PUT Spread"
    },
    {
        "marketSentiment": "bearish",
        "putCallRatio": "overbought",
        "orderType": "sell",
        "strategy": "Bear PUT Spread"
    },
    {
        "marketSentiment": "neutral",
        "putCallRatio": "overbought",
        "orderType": "sell",
        "strategy": "Short Straddle"
    },
    {
        "marketSentiment": "bullish",
        "putCallRatio": "overbought",
        "orderType": "sell",
        "strategy": "Bull CALL Spread"
    },
    {
        "marketSentiment": "very bullish",
        "putCallRatio": "overbought",
        "orderType": "sell",
        "strategy": "Bull CALL Spread"
    }
];