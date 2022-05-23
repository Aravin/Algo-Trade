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
                    tradeId: { N: data.tradeId + '' },
                    orderId: { S: data.orderId },
                    orderStatus: { S: 'open' },
                    script: { S: data.script },
                    lotSize: { N: data.lotSize + '' },
                    orderTime: { S: new Date().toISOString() },
                    buyPrice: { N: data.buyPrice + '' },
                },
            };
            try {
                return local.send(new PutItemCommand(params));
            } catch (err: unknown) {
                console.log((err as Error).message);
            }
        },
        exitTradeLog: (data: any) => {
            console.log(data);
            const local = createInstance();
            const params: UpdateItemCommandInput = {
                TableName: "algo_trade_log",
                Key: { tradeId: { N: data.tradeId + '' } },
                UpdateExpression: 'set exitTime = :a, sellPrice = :b, orderId =:c, pnl = :d, exitReason = :e, orderStatus = :f',
                ExpressionAttributeValues: {
                    ':a': { S: new Date().toISOString() },
                    ':b': { N: data.sellPrice + '' },
                    ':c': { S: data.orderId },
                    ':d': { N: data.pnl },
                    ':e': { S: data.exitReason },
                    ':f': { S: 'closed' },
                },
            };
            try {
                return local.send(new UpdateItemCommand(params));
            } catch (err: unknown) {
                console.log((err as Error).message);
            }
        },
    }
})();
