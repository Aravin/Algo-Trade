import { ddbClient } from './db';
import { getGlobalMarket } from './globalMarket';
import { getIndiaMarket } from './indianMarket';

export const run = async (event: any, context: any): Promise<void> => {
    try {
        const globalSentiment = await getGlobalMarket();
        const { sentiment: indiaSentiment, trend } = await getIndiaMarket();
        const dateTime = new Date().toISOString();
        let marketStatus = '';
        let signal = '';

        if (globalSentiment !== indiaSentiment) {
            marketStatus = `Global & Indian Market Sentiment is different`;
            return;
        }
        else if (new Set([globalSentiment, indiaSentiment, 'neutral']).size === 1) {
            marketStatus = `Market Sentiment is neutral`;
            return;
        }
        else if (trend.atr.action?.includes('less')) {
            marketStatus = `No volalite in NIFTY50 - ATR action - ${trend}`;
        }
        else if (new Set([globalSentiment, indiaSentiment, 'positive']).size === 1) {
            marketStatus = `Market is Positive`;
            signal = 'Buy Call';
        }
        else if (new Set([globalSentiment, indiaSentiment, 'negative']).size === 1) {
            marketStatus = `Market is Negative`;
            signal = 'Put Call';
        }

        console.log(globalSentiment, indiaSentiment, trend.atr.action, marketStatus, signal);

        ddbClient.insert({ globalSentiment, indiaSentiment, volatility: trend.atr.action, dateTime, marketStatus, signal });
        ddbClient.update({ globalSentiment, indiaSentiment, volatility: trend.atr.action, dateTime, marketStatus, signal });
    }
    catch (err: any) {
        console.log(err.message);
    }
};

// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-table-read-write.html
