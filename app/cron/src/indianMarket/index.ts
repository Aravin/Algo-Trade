import { scrapIndiaMarket } from './scrap';
import { sentimentSignalMapping } from './sentimentSignalMapping';

export async function getIndiaMarket() {
    const [niftyTrend1Min, niftyTrend5Min] = await Promise.all([scrapIndiaMarket(60), scrapIndiaMarket(300)]);

    const currentSentiment =
        sentimentSignalMapping.find(s =>
                s['5minTrend'].toLowerCase() ===  niftyTrend5Min.summary
                && s['1minTrend'].toLowerCase() ===  niftyTrend1Min.summary
                )

    return {
        sentiment: currentSentiment?.sentiment,
        signal: currentSentiment?.signal,
        trend:
        {
            atr: niftyTrend1Min.trend.atr,
            rsi: niftyTrend1Min.trend.rsi,
            hl: niftyTrend1Min.trend.hl
        }
    };
}
