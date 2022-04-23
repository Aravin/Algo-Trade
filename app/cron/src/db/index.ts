import { DeleteItemCommand, DeleteItemCommandInput, DynamoDBClient, PutItemCommand, PutItemCommandInput } from '@aws-sdk/client-dynamodb';

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
            console.log(data)
            const local = createInstance();
            const params: PutItemCommandInput = {
                TableName: "algo_trade_sentiment",
                Item: {
                    date_time: { S: data.dateTime },
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
        update: (data: any) => {
            const local = createInstance();

            try {
                // delete
                const deleteInput: DeleteItemCommandInput = {
                    TableName: 'algo_trade_sentiment_latest',
                    Key: {
                        latest: { S: "latest" },
                    }
                }
                local.send(new DeleteItemCommand(deleteInput));

                // insert
                const params: PutItemCommandInput = {
                    TableName: "algo_trade_sentiment_latest",
                    Item: {
                        date_time: { S: data.dateTime },
                        global: { S: data.globalSentiment },
                        local: { S: data.indiaSentiment },
                        volatility: { S: data.volatility },
                        latest: { S: "latest" },
                    },
                };

                return local.send(new PutItemCommand(params));

                // const params: UpdateItemCommandInput = {
                //     TableName: 'algo_trade_sentiment_latest',
                //     Key: { latest: { S: "latest" } },
                //     UpdateExpression: 'set date_time = :a, global = :b, local = :c, volatility = :d',
                //     ExpressionAttributeValues: {
                //         ':a': data.dateTime,
                //         ':b': data.global,
                //         ':c': data.local,
                //         ':d': data.volatility,
                //     }
                // }
                // local.send(new UpdateItemCommand(params));
            } catch (err: any) {
                console.log(err.message);
            }
        }
    }
})();
