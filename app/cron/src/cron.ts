import { ddbClient } from './db';
import { getGlobalMarket } from './globalMarket';
import { getIndiaMarket } from './indianMarket';

export const run = async (event: any, context: any): Promise<void> => {
    try {
        const globalSentiment = await getGlobalMarket();
        const { sentiment: indiaSentiment, trend } = await getIndiaMarket();
        const dateTime = new Date().toISOString();

        console.log(globalSentiment, indiaSentiment, trend.atr.action);

        ddbClient.insert({ globalSentiment, indiaSentiment, volatility: trend.atr.action, dateTime });
        ddbClient.update({ globalSentiment, indiaSentiment, volatility: trend.atr.action, dateTime });
    }
    catch (err: any) {
        console.log(err.message);
    }
};

// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-table-read-write.html
