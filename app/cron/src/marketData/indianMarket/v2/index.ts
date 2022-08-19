import { scrapIndiaMarket } from './scrape';

export async function getIndiaMarket() {
    const niftyTrend1Min = await scrapIndiaMarket(60);

    return {
        volatility: niftyTrend1Min.volatility.atr.action,
        trend: niftyTrend1Min.trend.rsi.action,
    };
}
