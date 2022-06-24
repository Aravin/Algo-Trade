import { scrapIndiaMarket } from './scrap';

export async function getIndiaMarket() {
    const [niftyTrend1Min, niftyTrend5Min] = await Promise.all([scrapIndiaMarket(60), scrapIndiaMarket(300)]);

    const currentSentiment =
        sentimentMapping.find(s =>
                s['5minTrend'].toLowerCase() ===  niftyTrend5Min.summary
                && s['1minTrend'].toLowerCase() ===  niftyTrend1Min.summary
                )

    return {
        sentiment: currentSentiment?.Signal2,
        strength: currentSentiment?.Strength2,
        trend:
        {
            atr: niftyTrend1Min.trend.atr,
            rsi: niftyTrend1Min.trend.rsi,
            hl: niftyTrend1Min.trend.hl
        }
    };
}

const sentimentMapping = [
    {
        "5minTrend": "Strong Sell",
        "1minTrend": "Strong Sell",
        "Signal": "Sell",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Strong Sell",
        "1minTrend": "Sell",
        "Signal": "Sell",
        "Strength": "Risk",
        "Strength2": "Risk",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Strong Sell",
        "1minTrend": "Neutral",
        "Signal": "Neutral",
        "Strength": "",
        "Strength2": "Exit",
        "Signal2": "neutral"
    },
    {
        "5minTrend": "Strong Sell",
        "1minTrend": "Buy",
        "Signal": "Buy",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "positive"
    },
    {
        "5minTrend": "Strong Sell",
        "1minTrend": "Strong Buy",
        "Signal": "Buy",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "positive"
    },
    {
        "5minTrend": "Sell",
        "1minTrend": "Strong Sell",
        "Signal": "Sell",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Sell",
        "1minTrend": "Sell",
        "Signal": "Sell",
        "Strength": "",
        "Strength2": "Hold",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Sell",
        "1minTrend": "Neutral",
        "Signal": "Neutral",
        "Strength": "",
        "Strength2": "Exit",
        "Signal2": "neutral"
    },
    {
        "5minTrend": "Sell",
        "1minTrend": "Buy",
        "Signal": "Buy",
        "Strength": "",
        "Strength2": "Exit",
        "Signal2": "positive"
    },
    {
        "5minTrend": "Sell",
        "1minTrend": "Strong Buy",
        "Signal": "Buy",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "positive"
    },
    {
        "5minTrend": "Neutral",
        "1minTrend": "Strong Sell",
        "Signal": "Sell",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Neutral",
        "1minTrend": "Sell",
        "Signal": "Sell",
        "Strength": "Risk",
        "Strength2": "Risk",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Neutral",
        "1minTrend": "Neutral",
        "Signal": "Neutral",
        "Strength": "",
        "Strength2": "Risk",
        "Signal2": "neutral"
    },
    {
        "5minTrend": "Neutral",
        "1minTrend": "Buy",
        "Signal": "Buy",
        "Strength": "Risk",
        "Strength2": "Risk",
        "Signal2": "positive"
    },
    {
        "5minTrend": "Neutral",
        "1minTrend": "Strong Buy",
        "Signal": "Buy",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "positive"
    },
    {
        "5minTrend": "Buy",
        "1minTrend": "Strong Sell",
        "Signal": "Sell",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Buy",
        "1minTrend": "Sell",
        "Signal": "Sell",
        "Strength": "",
        "Strength2": "Exit",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Buy",
        "1minTrend": "Neutral",
        "Signal": "Neutral",
        "Strength": "",
        "Strength2": "Exit",
        "Signal2": "neutral"
    },
    {
        "5minTrend": "Buy",
        "1minTrend": "Buy",
        "Signal": "Buy",
        "Strength": "",
        "Strength2": "Hold",
        "Signal2": "positive"
    },
    {
        "5minTrend": "Buy",
        "1minTrend": "Strong Buy",
        "Signal": "Buy",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "positive"
    },
    {
        "5minTrend": "Strong Buy",
        "1minTrend": "Strong Sell",
        "Signal": "Sell",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Strong Buy",
        "1minTrend": "Sell",
        "Signal": "Sell",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "negative"
    },
    {
        "5minTrend": "Strong Buy",
        "1minTrend": "Neutral",
        "Signal": "Neutral",
        "Strength": "",
        "Strength2": "Exit",
        "Signal2": "neutral"
    },
    {
        "5minTrend": "Strong Buy",
        "1minTrend": "Buy",
        "Signal": "Buy",
        "Strength": "Risk",
        "Strength2": "Risk",
        "Signal2": "positive"
    },
    {
        "5minTrend": "Strong Buy",
        "1minTrend": "Strong Buy",
        "Signal": "Buy",
        "Strength": "Strong",
        "Strength2": "Strong",
        "Signal2": "positive"
    }
];
