import { DynamoDBClient, PutItemCommand, PutItemCommandInput, GetItemCommand, GetItemCommandInput, UpdateItemCommandInput, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

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
        insert: (data: any) => {
            const local = createInstance();
            const params: PutItemCommandInput = {
                TableName: "algo_trade_sentiment",
                Item: {
                    date_time: { S: new Date().toISOString() },
                    global: { S: data.globalSentiment },
                    local: { S: data.indiaSentiment },
                    volatility: { S: data.volatility },
                },
            };
            try {
                return local.send(new PutItemCommand(params));
            } catch (err: any) {
                console.log(err.message);
            }
        },
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
                }
            } catch (err: any) {
                console.log(err.message);
            }
        },
        insertTradeLog: (data: any) => {
            const local = createInstance();
            const params: PutItemCommandInput = {
                TableName: "algo_trade_log",
                Item: {
                    date_time: { S: new Date().toISOString() },
                    orderId: {S: data.orderId},
                    script: { S: data.script },
                    lotSize: { S: data.lotSize },
                    buyPrice: { S: data.buyPrice },
                    orderStatus: { S: 'open' },
                },
            };
            try {
                return local.send(new PutItemCommand(params));
            } catch (err: any) {
                console.log(err.message);
            }
        },
        exitTradeLog: (data: any) => {
            const local = createInstance();
            const params: UpdateItemCommandInput = {
                TableName: "algo_trade_log",
                Key: { orderId: { S: data.orderId } },
                UpdateExpression: 'set sellPrice = :a, pnl = :b, exitReason = :c, orderStatus = :d',
                ExpressionAttributeValues: {
                    ':a': { S: data.sellPrice },
                    ':b': { S: data.pnl},
                    ':c': { S: data.exitReason },
                    ':d': { S: 'closed' },
                },
            };
            try {
                return local.send(new UpdateItemCommand(params));
            } catch (err: any) {
                console.log(err.message);
            }
        },
    }
})();
