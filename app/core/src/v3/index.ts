import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone  from 'dayjs/plugin/timezone';
import cron from 'node-cron';
import { ddbClient } from './../helpers/db';
import { log } from './../helpers/log';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Kolkata");

cron.schedule('35 30-59/1 9 * * 1-5', () => {
    log.info(`Service Running... - ${dayjs().format('hh:mm:ss')}`);
    run();
}, { timezone: 'Asia/Kolkata' });

cron.schedule('35 * 10-14 * * 1-5', () => {
    log.info(`Service Running... - ${dayjs().format('hh:mm:ss')}`);
    run();
}, { timezone: 'Asia/Kolkata' });

const run = async () => {
    try {
        // from local
        const data = await cronMarketData();
        await core(data);
    }
    catch (err: unknown) {
        const e = (err as Error);
        log.error(e.message + JSON.stringify(e.stack));
        log.error('Error: Retry at next attempt. ');
    }
}

import { appConfig } from "./../config/app";
import { Account } from "./../models/account";
import { findNextExpiry } from "./../shared/expiryDate";
import { toFixedNumber } from "./../helpers/number/toFixed";
import { buySellSignal } from "./../shared/buySellSignal";
import { cronMarketData } from './cron';
import { appState } from './state';
import { upstox } from '../services/upstox';
import { getMarketSentiment } from '../shared/getMarketSentiment';
import { api } from '../helpers/http';
import { sendNotification } from '../helpers/notification/telegram';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Kolkata");

let STATE = 'START';
let ORDER_ID = '';
let TRADE_ID = 0;
let ORDER_BUY_PRICE = 0.0;
let ORDER_LOT = 0;
let SCRIPT = '';
let ORDERED_SENTIMENT = '';
let ORDERED_TOKEN = '';
let PENDING_TRADE_PER_DAY = appConfig.maxTradesPerDay;
let PENDING_LOSS_TRADE_PER_DAY = appConfig.maxLossTradesPerDay;
let ACCOUNT_VALUE = 0;
let CURRENT_TRADE_LOW_PRICE = 0;
let CURRENT_TRADE_HIGH_PRICE = 0;

const resetLastTrade = () => {
    --PENDING_TRADE_PER_DAY ? STATE = 'START' : STATE = 'STOP';
    PENDING_LOSS_TRADE_PER_DAY ? STATE = 'START' : STATE = 'STOP';
    ORDERED_SENTIMENT = '';
    ORDER_ID = '';
    TRADE_ID = 0;
    ORDERED_TOKEN = '';
    ORDER_BUY_PRICE = 0.0;
    ORDER_LOT = 0;
    SCRIPT = '';
    ACCOUNT_VALUE = 0;
    CURRENT_TRADE_LOW_PRICE = 0;
    CURRENT_TRADE_HIGH_PRICE = 0;
}

const resetDayTrades = () => {
    PENDING_TRADE_PER_DAY = 0;
    resetLastTrade();
}

export const core = async (data: any) => {

    try {
        const shortTime = +dayjs.tz(new Date()).format('HHmm');
        const isMarketClosed = shortTime < 930 || shortTime >= 1458;

        // from aws
        // const data = await ddbClient.get();
        const { niftySentiment, globalSentiment, pcr } = data;

        const orderType = getMarketSentiment(globalSentiment, niftySentiment, pcr);

        // finvasia
        const account = Account.getInstance();
        account.token = await api.login();

        if (STATE === 'STOP') {
            log.info('Service Stopped, Trading over for the day');
        }
        else if (STATE === 'START') {
            // special case - TODO: convert to event
            if (isMarketClosed) {
                log.info('Market Closing Time ⌛, stopping the application');
                STATE = 'STOP';
                PENDING_TRADE_PER_DAY = 0;
                return;
            }

            if (!orderType || orderType == 'hold') {
                log.info(`No buy/sell signal in market! - No Strategy`);
                return;
            }

            // if (niftySentiment !== globalSentiment) {
            //     log.info(`Local & Global Sentiments are different!`);
            //     return;
            // }

            // if (niftySentiment === 'neutral') {
            //     log.info(`No signal in Indian market!`);
            //     return;
            // }

            log.info(`Market is ${niftySentiment} ✅, placing ${orderType} Order`);
            const order = await placeOrder(orderType as any);

            ORDER_ID = order.orderId;
            TRADE_ID = Date.now();
            SCRIPT = order.script;
            ORDER_BUY_PRICE = +order.orderPrice;
            ORDER_LOT = +order.orderLot;
            ORDERED_SENTIMENT = niftySentiment + '';
            ORDERED_TOKEN = order.scriptToken;
            STATE = 'ORDERED';

            ddbClient.insertTradeLog(
                {
                    orderId: ORDER_ID,
                    tradeId: TRADE_ID,
                    script: SCRIPT,
                    buyPrice: ORDER_BUY_PRICE,
                    lotSize: ORDER_LOT,
                    sentiment: ORDERED_SENTIMENT,
                },
            );
        }
        else if (STATE === 'ORDERED') {
            log.info(
                {
                    orderSentiment: ORDERED_SENTIMENT,
                    orderType,
                },
            );

            // special case - TODO: convert to event
            if (isMarketClosed) {
                log.info('Market Closing Time ⌛, exiting the position');
                const { orderId, sellPrice } = await placeSellOrder(SCRIPT, ORDER_LOT);
                const changePercent = toFixedNumber(((sellPrice - ORDER_BUY_PRICE) / ORDER_BUY_PRICE) * 100);
                const absChangePercent = toFixedNumber((((((sellPrice - ORDER_BUY_PRICE) * ORDER_LOT) + ACCOUNT_VALUE) - ACCOUNT_VALUE) / ACCOUNT_VALUE) * 100);
                ddbClient.exitTradeLog(
                    {
                        orderId: orderId,
                        tradeId: TRADE_ID,
                        sellPrice,
                        pnl: changePercent,
                        absolutePnl: absChangePercent,
                        exitReason: 'Market Closing',
                    },
                );
                resetDayTrades();
                return;
            }

            // exit in case of loss
            const scriptQuote = await api.scriptQuote('NFO', ORDERED_TOKEN);
            const lp = +scriptQuote.lp;
            const changePercent = toFixedNumber(((lp - ORDER_BUY_PRICE) / ORDER_BUY_PRICE) * 100);
            const absChangePercent = toFixedNumber((((((lp - ORDER_BUY_PRICE) * ORDER_LOT) + ACCOUNT_VALUE) - ACCOUNT_VALUE) / ACCOUNT_VALUE) * 100);
            
            // set min and max loss
            CURRENT_TRADE_LOW_PRICE = Math.min(ORDER_BUY_PRICE, lp, CURRENT_TRADE_LOW_PRICE ? CURRENT_TRADE_LOW_PRICE : lp);
            CURRENT_TRADE_HIGH_PRICE = Math.max(ORDER_BUY_PRICE, lp, CURRENT_TRADE_HIGH_PRICE ? CURRENT_TRADE_HIGH_PRICE : lp);

            log.debug({ ORDER_BUY_PRICE, lp, changePercent, absChangePercent });

            const canExit = canExitPosition(changePercent, ORDERED_SENTIMENT, niftySentiment);

            if (canExit) {
                log.info(`${canExit ? 'Dynamic ': ''}P&L reached ${absChangePercent} with market, exiting the position`);

                const { orderId, sellPrice } = await placeSellOrder(SCRIPT, ORDER_LOT);
                ddbClient.exitTradeLog(
                    {
                        orderId: orderId,
                        tradeId: TRADE_ID,
                        sellPrice,
                        pnl: changePercent,
                        absolutePnl: absChangePercent,
                        exitReason: `P&L reached ${changePercent}`,
                        highPrice: CURRENT_TRADE_HIGH_PRICE,
                        lowPrice: CURRENT_TRADE_LOW_PRICE,
                    },
                );
                resetLastTrade();
                return;
            }

            // holding the position
            if (orderType === 'hold' || niftySentiment === 'neutral') {
                log.info(`Indian Market is ${ORDERED_SENTIMENT} ✅, holding the position`);
                return;
            }

            log.info(`Indian Market is ${niftySentiment} ❌, exiting the position`);
            const { orderId, sellPrice } = await placeSellOrder(SCRIPT, ORDER_LOT);
            ddbClient.exitTradeLog(
                {
                    orderId: orderId,
                    tradeId: TRADE_ID,
                    sellPrice,
                    pnl: changePercent,
                    absolutePnl: absChangePercent,
                    exitReason: 'Sentiment Changed',
                    highPrice: CURRENT_TRADE_HIGH_PRICE,
                    lowPrice: CURRENT_TRADE_LOW_PRICE,
                },
            );
            resetLastTrade();
        }
    }
    catch (err: unknown) {
        if (process.env.NODE_ENV === 'development') {
            log.error(JSON.stringify(err, null, 2));
        }
        else {
            log.error((err as Error).message + JSON.stringify((err as Error).stack));
        }

        sendNotification(`CORE - ${(err as Error).message} - ${JSON.stringify((err as Error).stack)}`);
        log.error('Error: Retry at next attempt. ');
    }
}

const placeOrder = async (orderType: 'buy' | 'sell') => {
    const callOrPut = orderType === 'buy' ? 'CE' : 'PE';

    const limits = await api.accountLimit();
    const accountMargin = ((+(limits.cash || 0) + +(limits.payin || 0)) - +(limits.premium || 0));
    ACCOUNT_VALUE = accountMargin;
    const tradeMargin = accountMargin * 95 / 100;
    const { expiryDate, daysLeft } = findNextExpiry();
    const quote = await api.scriptQuote('NSE', '26000');
    const niftyLastPrice = parseFloat(quote.lp);
    const strikePrice = (Math.floor(daysLeft / 2) * 100) + appConfig.otmPrice;
    const bestStrike = (Math.round(niftyLastPrice / 100) * 100) + (callOrPut === 'CE' ? strikePrice : -strikePrice);
    const script = await api.scriptSearch(`NIFTY ${expiryDate} ${bestStrike} ${callOrPut}`);
    const scriptQuote = await api.scriptQuote('NFO', script.values[0].token);
    const scriptLastPrice = parseFloat(scriptQuote.lp);
    const scriptLot = +scriptQuote.ls;
    const requiredMargin = Math.ceil(scriptLastPrice * scriptLot);

    if (requiredMargin > tradeMargin) {
        throw new Error(`Insufficient fund to place order ${script.values[0].tsym}. Required Rs.${requiredMargin} - Available Rs. ${tradeMargin}`);
    }

    const orderLot = Math.floor(tradeMargin / (scriptLot * scriptLastPrice)) * scriptLot;
    const order = await api.placeOrder('B', script.values[0].tsym, orderLot);
    const orders = await api.orderList();
    const lastOrder = orders.find((d: any) => d.norenordno === order);

    return { orderId: order, script: script.values[0].tsym, orderLot: orderLot, orderPrice: lastOrder?.avgprc, scriptToken: script.values[0].token };
}

const placeSellOrder = async (script: string, lot: number) => {
    const order = await api.placeOrder('S', script, lot);
    const orders = await api.orderList();
    const lastOrder = orders.find((d: any) => d.norenordno === order);

    return { orderId: order, script: script, sellPrice: +lastOrder?.avgprc };
}

const canExitPosition = (
    changePercent: number,
    orderedSentiment: string,
    currentSentiment: string,
) => {

    if (orderedSentiment !== currentSentiment) {
        return true;
    }

    const maxProfitPerTrade = appConfig.maxProfitPerTrade;
    const maxLossPerTrade = appConfig.maxLossPerTrade;

    log.info({ maxProfitPerTrade, maxLossPerTrade });

    if (changePercent > maxProfitPerTrade) {
        return true;
    } else if (changePercent < -maxLossPerTrade) {
        PENDING_LOSS_TRADE_PER_DAY--;
        return true;
    }

    return false;
}

export const resetTrades = () => {
    STATE = 'START';
    PENDING_TRADE_PER_DAY = appConfig.maxTradesPerDay;
}
