import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from "dayjs/plugin/timezone";
import { appConfig } from "./config/app";
import { ddbClient } from "./helpers/db";
import { api } from "./helpers/http";
import { Account } from "./models/account";
import { findNextExpiry } from "./shared/expirtyDate";
import { toFixedNumber } from "./helpers/number/toFixed";
import { log } from "./helpers/log";

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
let ACCOUNT_VALUE = 0;

const resetLastTrade = () => {
    PENDING_TRADE_PER_DAY = PENDING_TRADE_PER_DAY - 1;
    PENDING_TRADE_PER_DAY ? STATE = 'START' : STATE = 'STOP';
    ORDERED_SENTIMENT = '';
    ORDER_ID = '';
    TRADE_ID = 0;
    ORDERED_TOKEN = '';
    ORDER_BUY_PRICE = 0.0;
    ORDER_LOT = 0;
    SCRIPT = '';
    ACCOUNT_VALUE = 0;
}

const resetDayTrades = () => {
    PENDING_TRADE_PER_DAY = 0;
    resetLastTrade();
}

export const core = async (data: any) => {

    try {
        const shortTime = +dayjs.tz(new Date()).format('HHmm');
        const marketClosed = shortTime < 930 || shortTime >= 1458;

        // from aws
        // const data = await ddbClient.get();
        const { indiaSentiment, signal, volatility, strength } = data;
        log.info({ orderSentiment: ORDERED_SENTIMENT, signal: data?.signal, volatility: data?.volatility, strength: data.strength });

        // finvasia
        const account = Account.getInstance();
        account.token = await api.login();

        if (STATE === 'STOP') {
            log.info('Service Stopped, Trading over for the day');
        }
        else if (STATE === 'START') {
            // special case - TODO: convert to event
            if (marketClosed) {
                log.info('Market Closing Time ⌛, stopping the application');
                STATE = 'STOP';
                PENDING_TRADE_PER_DAY = 0;
                return;
            }

            if (!appConfig.skipGlobalMarket && !signal) {
                log.info(`No signal in market! - Volatility ${volatility}`);
                return;
            }

            if (volatility?.toLowerCase().includes('less')) {
                log.info('No volatility in market!');
                return;
            }

            if (appConfig.skipGlobalMarket && indiaSentiment === 'neutral') {
                log.info(`No signal in Indian market!`);
                return;
            }

            const callOrPut = signal.includes('Call') ? 'CE' : 'PE';

            log.info(`Market is ${indiaSentiment} ✅, placing ${callOrPut} Order`);
            const order = await placeBuyOrder(callOrPut);

            ORDER_ID = order.orderId;
            TRADE_ID = Date.now();
            SCRIPT = order.script;
            ORDER_BUY_PRICE = +order.orderPrice;
            ORDER_LOT = +order.orderLot;
            ORDERED_SENTIMENT = indiaSentiment + '';
            ORDERED_TOKEN = order.scriptToken;
            STATE = 'ORDERED';

            ddbClient.insertTradeLog({ orderId: ORDER_ID, tradeId: TRADE_ID, script: SCRIPT, buyPrice: ORDER_BUY_PRICE, lotSize: ORDER_LOT });
        }
        else if (STATE === 'ORDERED') {
            // special case - TODO: convert to event
            if (marketClosed) {
                log.info('Market Closing Time ⌛, exiting the position');
                const { orderId, sellPrice } = await placeSellOrder(SCRIPT, ORDER_LOT);
                const changePercent = toFixedNumber(((sellPrice - ORDER_BUY_PRICE) / ORDER_BUY_PRICE) * 100);
                const absChangePercent = toFixedNumber((((sellPrice + ACCOUNT_VALUE) - ACCOUNT_VALUE) / ACCOUNT_VALUE) * 100);
                ddbClient.exitTradeLog(
                    {
                        orderId: orderId,
                        tradeId: TRADE_ID,
                        sellPrice,
                        pnl: changePercent,
                        absolutePnl: absChangePercent,
                        exitReason: 'Market Closing',
                    });
                resetDayTrades();
                return;
            }

            // exit in case of loss
            const scriptQuote = await api.scriptQuote('NFO', ORDERED_TOKEN);
            const lp = +scriptQuote.lp;
            const changePercent = toFixedNumber(((lp - ORDER_BUY_PRICE) / ORDER_BUY_PRICE) * 100);
            const absChangePercent = toFixedNumber((((lp + ACCOUNT_VALUE) - ACCOUNT_VALUE) / ACCOUNT_VALUE) * 100);
            log.debug({ ORDER_BUY_PRICE, lp, changePercent, absChangePercent, strength: data.strength });

            if (canExitPosition(changePercent, strength, ORDERED_SENTIMENT, indiaSentiment)) {
                log.info(`P&L reached ${absChangePercent} with market strength ${strength}, exiting the position`);
                const { orderId, sellPrice } = await placeSellOrder(SCRIPT, ORDER_LOT);
                ddbClient.exitTradeLog(
                    {
                        orderId: orderId,
                        tradeId: TRADE_ID,
                        sellPrice,
                        pnl: changePercent,
                        absolutePnl: absChangePercent,
                        exitReason: `P&L reached ${changePercent}`
                    });
                resetLastTrade();
                return;
            }

            // holding the position
            if (indiaSentiment === ORDERED_SENTIMENT) {
                log.info(`Indian Market is ${ORDERED_SENTIMENT} ✅, holding the position`);
                return;
            }

            log.info(`Indian Market is ${indiaSentiment} ❌, exiting the position`);
            const { orderId, sellPrice } = await placeSellOrder(SCRIPT, ORDER_LOT);
            ddbClient.exitTradeLog(
                {
                    orderId: orderId,
                    tradeId: TRADE_ID,
                    sellPrice,
                    pnl: changePercent,
                    absolutePnl: absChangePercent,
                    exitReason: 'Sentiment Changed',
                });
            resetLastTrade();
        }
    }
    catch (err: any) {
        log.error(err?.message);
        log.error('Error: Retry at next attempt. ');
    }
}

const placeBuyOrder = async (callOrPut: string) => {
    const limits = await api.accountLimit();
    const accountMargin = ((+(limits.cash || 0) + +(limits.payin || 0)) - +(limits.premium || 0));
    ACCOUNT_VALUE = accountMargin;
    const tradeMargin = accountMargin * 95 / 100;
    const { expiryDate, daysLeft } = findNextExpiry();
    const quote = await api.scriptQuote('NSE', '26000');
    const niftyLastPrice = parseFloat(quote.lp);
    const strikePrice = (daysLeft * 100) + appConfig.otmPrice;
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

// move to new file
const inverseStrength = {
    strong: 'exit',
    hold: 'risk',
    risk: 'hold',
    exit: 'strong'
}

const canExitPosition = (
    changePercent: number,
    strength: string,
    orderedSentiment: string,
    currentSentiment: string,
) => {

    if (orderedSentiment !== currentSentiment) {
        strength = inverseStrength[strength.toLowerCase() as keyof typeof inverseStrength];
    }

    let maxProfitPerTrade = appConfig.maxProfitPerTrade;
    let maxLossPerTrade = appConfig.maxLossPerTrade;

    switch (strength.toLowerCase()) {
        case 'strong':
            maxProfitPerTrade = maxProfitPerTrade * 4;
            maxLossPerTrade = maxLossPerTrade * 4;
            break;
        case 'hold':
            maxProfitPerTrade = maxProfitPerTrade * 2;
            maxLossPerTrade = maxLossPerTrade * 2;
            break;
        case 'risk':
            maxProfitPerTrade = maxProfitPerTrade / 2;
            maxLossPerTrade = maxLossPerTrade / 2;
            break;
        case 'exit':
            maxProfitPerTrade = 0;
            maxLossPerTrade = 0;
            break;
    }

    log.info({ maxProfitPerTrade, maxLossPerTrade });

    if (changePercent > maxProfitPerTrade || changePercent < -maxLossPerTrade) {
        return true;
    }

    return false;
}

export const resetTrades = () => {
    STATE = 'START';
    PENDING_TRADE_PER_DAY = appConfig.maxTradesPerDay;
}
