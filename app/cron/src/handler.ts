import { APIGatewayEvent, Context } from 'aws-lambda';
import { ddbClient } from './db';
import { getGlobalMarket } from './globalMarket';
import { getIndiaMarket } from './indianMarket';

export const run = async (event: APIGatewayEvent, context: Context): Promise<void> => {
    try {
        const globalSentiment = await getGlobalMarket();
        const { sentiment: indiaSentiment, trend } = await getIndiaMarket();

        console.log(globalSentiment, indiaSentiment, trend.atr.action);
        ddbClient.insert({ globalSentiment, indiaSentiment, volatility: trend.atr.action });
    }
    catch (err: any) {
        console.log(err.message);
    }
};

// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-table-read-write.html
