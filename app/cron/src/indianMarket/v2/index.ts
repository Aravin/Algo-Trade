import { scrapIndiaMarket } from '../v1/scrape';

export async function getIndiaMarket() {
    const niftyTrend1Min = await scrapIndiaMarket(60);

    return {
        volatility: niftyTrend1Min,
        trend: niftyTrend1Min.trend.rsi,
    };
}
