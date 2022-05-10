import { ddbClient } from './db';
import { getGlobalMarket } from './globalMarket';
import { getIndiaMarket } from './indianMarket';

export const run = async (event: any, context: any): Promise<void> => {
    try {
        console.time('cron');

        const dateTime = new Date().toISOString();
        console.timeLog('cron', 'cron called', dateTime);

        const globalSentiment = await getGlobalMarket();
        const { sentiment: indiaSentiment, trend } = await getIndiaMarket();
        let marketStatus = '';
        let signal = '';

        console.timeLog('cron', 'getGlobalMarket & getIndiaMarket completed');

        if (globalSentiment !== indiaSentiment) {
            marketStatus = `Global & Indian Market Sentiment is different`;
        }
        else if (new Set([globalSentiment, indiaSentiment, 'neutral']).size === 1) {
            marketStatus = `Market Sentiment is neutral`;
        }
        else if (trend.atr.action?.includes('less')) {
            marketStatus = `No volatility in market`;
        }
        else if (new Set([globalSentiment, indiaSentiment, 'positive']).size === 1) {
            marketStatus = `Market is Positive`;
            signal = 'Call';
        }
        else if (new Set([globalSentiment, indiaSentiment, 'negative']).size === 1) {
            marketStatus = `Market is Negative`;
            signal = 'Put';
        }

        console.timeLog('cron', globalSentiment, indiaSentiment, trend.atr.action, marketStatus, signal);
        ddbClient.insert({ globalSentiment, indiaSentiment, volatility: trend.atr.action, dateTime, marketStatus, signal });
        ddbClient.update({ globalSentiment, indiaSentiment, volatility: trend.atr.action, dateTime, marketStatus, signal });
        console.timeEnd('cron');
    }
    catch (err: any) {
        console.log(err.message);
    }
};

// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-table-read-write.html
