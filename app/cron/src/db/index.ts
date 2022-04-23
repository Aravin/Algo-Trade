import { DynamoDBClient, PutItemCommand, PutItemCommandInput } from '@aws-sdk/client-dynamodb';

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
        }
    }
})();
