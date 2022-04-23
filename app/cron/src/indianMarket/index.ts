import { scrapIndiaMarket } from './scrap';

export async function getIndiaMarket() {
    const [ niftyTrend1Min, niftyTrend5Min ] = await Promise.all([scrapIndiaMarket(60), scrapIndiaMarket(300)]);

    if ((niftyTrend5Min.summary === 'strong sell' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'sell' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'neutral' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'buy' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'strong buy' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary)) // risk
    ) {
        return {
            sentiment: 'positive', trend: { atr: niftyTrend1Min.trend.atr, rsi: niftyTrend1Min.trend.rsi, hl: niftyTrend1Min.trend.hl }
        };
    }
    else if ((niftyTrend5Min.summary === 'strong buy' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'buy' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'neutral' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'sell' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'strong sell' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
    ) {
        return {
            sentiment: 'negative', trend: { atr: niftyTrend1Min.trend.atr, rsi: niftyTrend1Min.trend.rsi, hl: niftyTrend1Min.trend.hl }
        };
    }

    return { sentiment: 'neutral', trend: { atr: niftyTrend1Min.trend.atr, rsi: niftyTrend1Min.trend.rsi, hl: niftyTrend1Min.trend.hl } };
}
