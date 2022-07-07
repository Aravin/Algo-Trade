import { DynamoDBClient, PutItemCommand, PutItemCommandInput, GetItemCommand, GetItemCommandInput, UpdateItemCommandInput, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { log } from '../log';

export const ddbClient = (() => {
    let instance: DynamoDBClient;

    const createInstance = () => {
        if (!instance) {
            instance = new DynamoDBClient({ region: "ap-south-1" });
        }
        return instance;
    }

    return {
        getInstance: () => createInstance(),
        get: async () => {
            const local = createInstance();
            const params: GetItemCommandInput = {
                TableName: "algo_trade_sentiment_latest", //TABLE_NAME
                Key: {
                    latest: { S: 'latest' },
                },
            };

            try {
                const data = await local.send(new GetItemCommand(params));
                const item = data.Item;

                return {
                    date_time: item?.date_time.S,
                    global: item?.global_sentiment.S,
                    local: item?.local_sentiment.S,
                    volatility: item?.volatility.S,
                    status: item?.market_status.S,
                    signal: item?.order_signal.S,
                    strength: item?.strength.S,
                }
            } catch (err: any) {
                log.error(err.message);
            }
        },
        insertTradeLog: (data: any) => {
            const local = createInstance();
            const params: PutItemCommandInput = {
                TableName: "algo_trade_log",
                Item: {
                    tradeId: { N: data.tradeId + '' },
                    orderId: { S: data.orderId },
                    orderStatus: { S: 'open' },
                    script: { S: data.script },
                    lotSize: { N: data.lotSize + '' },
                    orderTime: { S: new Date().toISOString() },
                    buyPrice: { N: data.buyPrice + '' },
                    sentiment: { S: data.sentiment },
                },
            };
            try {
                return local.send(new PutItemCommand(params));
            } catch (err: unknown) {
                log.error((err as Error).message);
            }
        },
        exitTradeLog: (data: any) => {
            const local = createInstance();
            const params: UpdateItemCommandInput = {
                TableName: "algo_trade_log",
                Key: { tradeId: { N: data.tradeId + '' } },
                UpdateExpression: 'set exitTime = :a, sellPrice = :b, orderId =:c, pnl = :d, absolutePnl = :e, exitReason = :f, orderStatus = :g',
                ExpressionAttributeValues: {
                    ':a': { S: new Date().toISOString() },
                    ':b': { N: data.sellPrice + '' },
                    ':c': { S: data.orderId },
                    ':d': { N: data.pnl + '' },
                    ':e': { N: data.absolutePnl + '' },
                    ':f': { S: data.exitReason },
                    ':g': { S: 'closed' },
                },
            };
            try {
                return local.send(new UpdateItemCommand(params));
            } catch (err: unknown) {
                log.error((err as Error).message);
            }
        },
    }
})();
