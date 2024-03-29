import axios from 'axios';
import { appConfig } from './config';
import { ddbClient } from './db';
import { getIndiaMarket } from './indianMarket/v2';
import { sendNotification } from './notification/telegram';

export const run = async (event: any, context: any): Promise<void> => {
    try {
        console.log('cron');

        const dateTime = new Date().toISOString();
        console.log('cron', 'cron called', dateTime);

        // const globalSentiment = await getGlobalMarket();
        const { momentum, trend: localSentiment, volatility } = await getIndiaMarket(); // trend can be 'buy', 'sell' 'overbougnt',  'oversold'
        let marketStatus = '';
        let buySellSignal = '';

        console.log('cron', 'getGlobalMarket & getIndiaMarket completed');

        // if (globalSentiment !== localSentiment) {
        //     marketStatus = `Global & Indian Market Sentiment is different`;
        // }
        // else if (new Set([globalSentiment, localSentiment, 'neutral']).size === 1) {
        //     marketStatus = `Market Sentiment is neutral`;
        // }
        if (volatility.includes('less')) {
            marketStatus = `No volatility in market`;
        }
        else if (new Set([localSentiment, 'buy']).size === 1) {
            marketStatus = `Market is Positive`;
            buySellSignal = 'CE';
        }
        else if (new Set([localSentiment, 'sell']).size === 1) {
            marketStatus = `Market is Negative`;
            buySellSignal = 'PE';
        }

        const data = {
            indiaSentiment: localSentiment,
            momentum,
            volatility,
            dateTime,
            marketStatus,
            buySellSignal,
        };
        console.log('cron', data);

        // post to webhook
        try {
            axios.post(appConfig.webhookURL, data);
        } catch (err: unknown) {
            console.log((err as Error).message);
        }

        // updated to db
        ddbClient.update(data);
        ddbClient.insert(data);

        console.log('cron end');
    }
    catch (err: unknown) {
        const errorMessage = `CRON - ${(err as Error).message}`;
        console.log(errorMessage);
        console.log((err as Error).stack);
        sendNotification(errorMessage);
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
        sendNotification(errorMessage);
    }
};

export const daysTradesLog = async (event: any, context: any): Promise<void> => {
    try {
        // get data from DB
        const getDayTrades = await ddbClient.getDayTrades();
        // update to db
        ddbClient.updateDayTrades(getDayTrades); 

    } catch (err: unknown) {
        const errorMessage = `CRON - DAYS_TRADE - ${(err as Error).message}`;
        console.log(errorMessage);
        sendNotification(errorMessage);
    }
}

daysTradesLog(null, null);

// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-table-read-write.html
