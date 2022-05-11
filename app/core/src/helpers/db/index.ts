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
                    order_date_time: { S: new Date().toISOString() },
                    orderId: { S: data.orderId + '' },
                    brokerOrderId: {S: data.brokerOrderId },
                    script: { S: data.script },
                    lotSize: { S: data.lotSize + ''},
                    buyPrice: { S: data.buyPrice + '' },
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
                Key: { orderId: { S: data.orderId + '' } },
                UpdateExpression: 'set brokerOrderId =:a, sellPrice = :b, pnl = :c, exitReason = :d, orderStatus = :e, exit_date_time = :f',
                ExpressionAttributeValues: {
                    ':a': { S: data.brokerOrderId },
                    ':b': { S: data.sellPrice + '' },
                    ':c': { S: data.pnl + ''},
                    ':d': { S: data.exitReason },
                    ':e': { S: 'closed' },
                    ':f': { S: new Date().toISOString() },
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
