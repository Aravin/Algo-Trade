import { DynamoDBClient, PutItemCommand, PutItemCommandInput, UpdateItemCommand, UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';

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
                    ttl: { N: Math.floor((Date.now() + 30*24*60*60*1000)/ 1000).toString() },
                    date_time: { S: data.dateTime },
                    global_sentiment: { S: data.globalSentiment },
                    local_sentiment: { S: data.indiaSentiment },
                    volatility: { S: data.volatility },
                    market_status: { S: data.marketStatus },
                    order_signal: { S: data.signal },
                    strength: { S: data.strength }
                },
            };
            try {
                return local.send(new PutItemCommand(params));
            } catch (err: any) {
                console.log(err.message);
            }
        },
        update: (data: any) => {
            const local = createInstance();

            try {
                // delete
                // const deleteInput: DeleteItemCommandInput = {
                //     TableName: 'algo_trade_sentiment_latest',
                //     Key: {
                //         latest: { S: "latest" },
                //     }
                // }
                // local.send(new DeleteItemCommand(deleteInput));

                // // insert
                // const params: PutItemCommandInput = {
                //     TableName: "algo_trade_sentiment_latest",
                //     Item: {
                //         date_time: { S: data.dateTime },
                //         global: { S: data.globalSentiment },
                //         local: { S: data.indiaSentiment },
                //         volatility: { S: data.volatility },
                //         latest: { S: "latest" },
                //     },
                // };

                // return local.send(new PutItemCommand(params));

                const params: UpdateItemCommandInput = {
                    TableName: 'algo_trade_sentiment_latest',
                    Key: { latest: { S: "latest" } },
                    UpdateExpression: 'set date_time = :a, global_sentiment = :b, local_sentiment = :c, volatility = :d, market_status = :e, order_signal = :f, strength = :g',
                    ExpressionAttributeValues: {
                        ':a': { S: data.dateTime },
                        ':b': { S: data.globalSentiment },
                        ':c': { S: data.indiaSentiment },
                        ':d': { S: data.volatility },
                        ':e': { S: data.marketStatus },
                        ':f': { S: data.signal },
                        ':g': { S: data.strength }
                    }
                }
                local.send(new UpdateItemCommand(params));
            } catch (err: any) {
                console.log(err.message);
            }
        }
    }
})();
