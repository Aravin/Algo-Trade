import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import cron from 'node-cron';
import { cronMarketData } from './cron';
import { MarketSentimentFull, cornData } from './types';
import { appConfig } from './config/app';
import { ddbClient } from './utils/db';
import { toFixedNumber } from './shared/number/toFixed';
import { api } from './brokers/finvasia/apis';
import { findNextExpiry } from './shared/expiryDate';
import { getMarketSentiment } from './shared/getMarketSentiment';
import { isMarketClosed } from './shared/isMarketOpen';
import { log } from './utils/log';
import { sendNotification } from './utils/notification/telegram';

const TIMEZONE = "Asia/Kolkata";
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault(TIMEZONE);

export const scheduleCron = (expression: string) => {
    return cron.schedule(expression, () => {
        log.info(`Service Running... - ${dayjs().format('hh:mm:ss')}`);
        run();
    }, { timezone: TIMEZONE });
};

const run = async () => {
    try {
        // from local
        const data: cornData = await cronMarketData();
        await core(data);
    }
    catch (err: unknown) {
        log.error(JSON.stringify((err as Error).stack, null, 2));
        log.error('Error: Retry at next attempt.');
    }
}

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
let TRADES_MISSED_DUE_TO_INSUFFICIENT_FUND = appConfig.tradesMissedDueToInsufficientFund;
let TRADING_OVER_NOTIFICATION_SENT = false;

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
    TRADES_MISSED_DUE_TO_INSUFFICIENT_FUND = appConfig.tradesMissedDueToInsufficientFund;
}

const resetDayTrades = () => {
    PENDING_TRADE_PER_DAY = 0;
    resetLastTrade();
}

export const core = async (data: cornData) => {

    try {
        // from aws
        // const data = await ddbClient.get();
        const { niftySentiment, globalSentiment, pcr } = data;
        const orderType = getMarketSentiment(globalSentiment, niftySentiment, pcr);

        if (STATE === 'STOP') {
            log.info('Service Stopped, trading over for the day');

            if (!TRADING_OVER_NOTIFICATION_SENT) {
                sendNotification('Service Stopped, trading over for the day');
                TRADING_OVER_NOTIFICATION_SENT = true;
            }
        }
        else if (STATE === 'START') {
            if (isMarketClosed()) {
                log.info('Market closing time ⌛, stopping the application');
                STATE = 'STOP';
                PENDING_TRADE_PER_DAY = 0;
                return;
            }

            if (!orderType || orderType == 'hold') {
                log.info(`No buy/sell signal in market! - No strategy`);
                return;
            }

            if (niftySentiment === 'neutral') {
                log.info(`No signal in Indian market!`);
                return;
            }

            log.info(`Market is ${niftySentiment} ✅, placing ${orderType} Order`);
            const order = await placeOrder(orderType);

            ORDER_ID = order.orderId;
            TRADE_ID = Date.now();
            SCRIPT = order.script;
            ORDER_BUY_PRICE = +order.orderPrice;
            ORDER_LOT = +order.orderLot;
            ORDERED_SENTIMENT = niftySentiment;
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
            if (isMarketClosed()) {
                log.info('Market Closing Time ⌛, exiting the position');
                const { orderId, sellPrice } = await placeExitOrder(SCRIPT, ORDER_LOT);
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
                        highPrice: CURRENT_TRADE_HIGH_PRICE,
                        lowPrice: CURRENT_TRADE_LOW_PRICE,
                    },
                );
                sendNotification(`Exit order placed - ${SCRIPT} - qty: ${ORDER_LOT} - pnl: ${changePercent}`);
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

            const canExit = canExitPosition(changePercent, ORDERED_SENTIMENT as MarketSentimentFull, niftySentiment);

            if (canExit) {
                log.info(`${canExit ? 'Dynamic ' : ''}P&L reached ${absChangePercent} with market, exiting the position`);

                const { orderId, sellPrice } = await placeExitOrder(SCRIPT, ORDER_LOT);
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
            if (orderType === 'hold'
                || niftySentiment === 'neutral'
                || ORDERED_SENTIMENT === niftySentiment) {
                log.info(`Market is ${ORDERED_SENTIMENT}, holding the position`);
                return;
            }

            log.info(`Market sentiment changed to ${niftySentiment} ❌, exiting the position`);
            const { orderId, sellPrice } = await placeExitOrder(SCRIPT, ORDER_LOT);
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
            sendNotification(`Exit order placed - ${SCRIPT} - qty: ${ORDER_LOT} - pnl: ${changePercent}`);
            resetLastTrade();
        }
    }
    catch (err: unknown) {
        log.error(JSON.stringify((err as Error).stack, null, 2));
        log.error('Error: Retry at next attempt.');
        throw ((err as Error).message);
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
        if (TRADES_MISSED_DUE_TO_INSUFFICIENT_FUND-- <= 0) {
            STATE = 'STOPPED'
        }

        throw `Insufficient fund to place order ${script.values[0].tsym}. Required Rs.${requiredMargin} - Available Rs. ${tradeMargin}`;
    }

    const orderLot = Math.floor(tradeMargin / (scriptLot * scriptLastPrice)) * scriptLot;
    const order = await api.placeOrder('B', script.values[0].tsym, orderLot);
    const orderNumber = order.norenordno;
    const orders = await api.orderList();
    const lastOrder = orders.find((d: any) => d.norenordno === orderNumber);

    // bad code: violate SRP
    sendNotification(`Buy order placed on ${script.values[0].tsym} - qty: ${orderLot}`);

    return { orderId: orderNumber, script: script.values[0].tsym, orderLot: orderLot, orderPrice: lastOrder?.avgprc, scriptToken: script.values[0].token };
}

const placeExitOrder = async (script: string, lot: number) => {
    const order = await api.placeOrder('S', script, lot);
    const orderNumber = order.norenordno;
    const orders = await api.orderList();
    const lastOrder = orders.find((d: any) => d.norenordno === orderNumber);

    // bad code: violate SRP
    sendNotification(`Sell order placed on ${script} - qty: ${lot}`);
    return { orderId: orderNumber, sellPrice: +lastOrder?.avgprc };
}

const canExitPosition = (
    changePercent: number,
    orderedSentiment: MarketSentimentFull,
    currentSentiment: MarketSentimentFull,
) => {

    const maxProfitPerTrade = appConfig.maxProfitPerTrade;
    const maxLossPerTrade = appConfig.maxLossPerTrade;

    // if ordered is bullish & current is very bullish then hold
    // same order is bearish & current is very bearish then hold
    if (orderedSentiment.includes('bullish') && currentSentiment === 'very bullish') {
        return false;
    } else if (orderedSentiment.includes('bearish') && currentSentiment === 'very bearish') {
        return false;
    }

    // if ordered sentiment is very bullish or bearish
    // current current sentiment is neutral, then exit
    if (orderedSentiment.includes('very') && currentSentiment === 'neutral') {
        return true;
    }

    // profit / loss reached
    if (changePercent > maxProfitPerTrade) {
        console.log('profit', changePercent, maxProfitPerTrade);
        return true;
    } else if (changePercent < -maxLossPerTrade) {
        console.log('loss', changePercent, -maxLossPerTrade);
        PENDING_LOSS_TRADE_PER_DAY--;
        return true;
    }

    // sentiment changed
    if (currentSentiment === 'neutral') {
        return false;
    } else if (orderedSentiment.includes('bullish') && currentSentiment.includes('bullish')) {
        return false;
    } else if (orderedSentiment.includes('bearish') && currentSentiment.includes('bearish')) {
        return false;
    }

    return false;
}

export const resetTrades = () => {
    STATE = 'START';
    PENDING_TRADE_PER_DAY = appConfig.maxTradesPerDay;
}

export const setToken = (token: string) => {
    appConfig.token = token;
}

export const exitTrade = () => placeExitOrder(SCRIPT, ORDER_LOT); 
