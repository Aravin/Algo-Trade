import { scrapIndiaMarket } from '../v2/scrape';

export async function getIndiaMarket() {
    const niftyTrend1Min = await scrapIndiaMarket(60);

    return {
        momentum: niftyTrend1Min.momentum.rsi.action,
        trend: niftyTrend1Min.trend.macd.action,
        volatility: niftyTrend1Min.volatility.atr.action,
    };
}
