import { DynamoDBClient, GetItemCommand, GetItemCommandInput, PutItemCommand, PutItemCommandInput, ScanCommand, ScanCommandInput, UpdateItemCommand, UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
import dayjs from 'dayjs';
import { toFixedNumber } from '../helpers/number/toFixed';

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
                    order_type: { S: data.buySellSignal },
                    order_signal: { S: data.signal }
                },
            };
            try {
                return local.send(new PutItemCommand(params));
            } catch (err: unknown) {
                console.log((err as Error).message);
            }
        },
        update: (data: any) => {
            const local = createInstance();

            try {
                const params: UpdateItemCommandInput = {
                    TableName: 'algo_trade_sentiment_latest',
                    Key: { latest: { S: "latest" } },
                    UpdateExpression: 'set date_time = :a, global_sentiment = :b, local_sentiment = :c, volatility = :d, market_status = :e, order_signal = :f, order_type = :g',
                    ExpressionAttributeValues: {
                        ':a': { S: data.dateTime },
                        ':b': { S: data.globalSentiment },
                        ':c': { S: data.indiaSentiment },
                        ':d': { S: data.volatility },
                        ':e': { S: data.marketStatus },
                        ':f': { S: data.signal },
                        ':g': { S: data.buySellSignal }
                    }
                }
                local.send(new UpdateItemCommand(params));
            } catch (err: unknown) {
                console.log((err as Error).message);
            }
        },
        getDayTrades: async () => {
            const local = createInstance();
            const todayStartEpoch = dayjs(dayjs().format('YYYY-MM-DD')).valueOf();

            const params: ScanCommandInput = {
                TableName: "algo_trade_log", //TABLE_NAME
                FilterExpression: 'tradeId > :tradeId',
                ExpressionAttributeValues: { ':tradeId': { N: todayStartEpoch + '' }, },
            };

            try {
                const data = await local.send(new ScanCommand(params));
                const items = data.Items || [];

                let absolutePnl =  0.00;
                let pnl = 0.00;
                let totalTrades = 0;
                let positiveTrades = 0;
                let negativeTrades = 0;

                items.forEach(item => {
                    absolutePnl += parseFloat(item.absolutePnl.N || '0'),
                    pnl += parseFloat(item.pnl.N || '0'),
                    totalTrades += 1
                    positiveTrades = parseFloat(item.pnl.N || '0') >= 0 ? ++positiveTrades : positiveTrades,
                    negativeTrades = parseFloat(item.pnl.N || '0') < 0 ? ++negativeTrades : negativeTrades
                });
 
                return {
                    absolutePnl: toFixedNumber(absolutePnl),
                    pnl: toFixedNumber(pnl),
                    totalTrades,
                    positiveTrades,
                    negativeTrades
                };

            } catch (err: unknown) {
                console.log((err as Error).message);
            }
        },
        // insert / update works as same
        updateDayTrades: async (data: any) => {
            const local = createInstance();
            const todayDate = dayjs().format('YYYY-MM-DD');

            try {
                const params: UpdateItemCommandInput = {
                    TableName: 'algo_trade_log_day',
                    Key: { tradeDate: { S: todayDate } },
                    UpdateExpression: 'set absolutePnl = :a, pnl = :b, totalTrades = :c, positiveTrades = :d, negativeTrades = :e',
                    ExpressionAttributeValues: {
                        ':a': { N: data.absolutePnl + '' },
                        ':b': { N: data.pnl + '' },
                        ':c': { N: data.totalTrades + '' },
                        ':d': { N: data.positiveTrades + '' },
                        ':e': { N: data.negativeTrades + '' }
                    }
                }
                local.send(new UpdateItemCommand(params));
            } catch (err: unknown) {
                console.log((err as Error).message);
            }
        }
    }
})();
