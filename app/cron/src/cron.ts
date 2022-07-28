import axios from 'axios';
import { appConfig } from './config';
import { ddbClient } from './db';
import { getGlobalMarket } from './globalMarket';
import { getIndiaMarket } from './indianMarket';
import { ssnClient } from './notification';

export const run = async (event: any, context: any): Promise<void> => {
    try {
        console.time('cron');

        const dateTime = new Date().toISOString();
        console.timeLog('cron', 'cron called', dateTime);

        const globalSentiment = await getGlobalMarket();
        const { sentiment: localSentiment, trend, signal } = await getIndiaMarket();
        let marketStatus = '';
        let buySellSignal = '';

        console.timeLog('cron', 'getGlobalMarket & getIndiaMarket completed');

        if (globalSentiment !== localSentiment) {
            marketStatus = `Global & Indian Market Sentiment is different`;
        }
        else if (new Set([globalSentiment, localSentiment, 'neutral']).size === 1) {
            marketStatus = `Market Sentiment is neutral`;
        }
        else if (trend.atr.action?.includes('less')) {
            marketStatus = `No volatility in market`;
        }
        else if (new Set([globalSentiment, localSentiment, 'positive']).size === 1) {
            marketStatus = `Market is Positive`;
            buySellSignal = 'CE';
        }
        else if (new Set([globalSentiment, localSentiment, 'negative']).size === 1) {
            marketStatus = `Market is Negative`;
            buySellSignal = 'PE';
        }

        const data = {
            globalSentiment,
            indiaSentiment: localSentiment,
            volatility: trend?.atr?.action,
            dateTime,
            marketStatus,
            signal,
            buySellSignal,
        };
        console.timeLog('cron', data);

        // post to webhook
        axios.post(appConfig.webhookURL, data);

        // updated to db
        ddbClient.update(data);
        ddbClient.insert(data);

        console.timeEnd('cron');
    }
    catch (err: unknown) {
        const errorMessage = `CRON - ${(err as Error).message}`;
        console.log(errorMessage);
        ssnClient.postMessage(errorMessage);
    }
};

export const reset = async (event: any, context: any): Promise<void> => {
    try {
        const response = await axios.get(appConfig.webhookURL + '/reset');
        console.log(response.data);
    }
    catch (err: unknown) {
        const errorMessage = `CRON - ${(err as Error).message}`;
        console.log(errorMessage);
        ssnClient.postMessage(errorMessage);
    }
};

// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-table-read-write.html
