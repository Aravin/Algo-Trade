import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from "dayjs/plugin/timezone";
import { appConfig } from "../../config/app";
import { ddbClient } from "../../utils/db";
import { Account } from "../../models/account";
import { findNextExpiry } from "../../shared/expiryDate";
import { toFixedNumber } from "../../shared/number/toFixed";
import { log } from "../../helpers/log";
import { buySellSignal } from "../../shared/buySellSignal";
import { sendNotification } from "../../helpers/notification/telegram";
import { api } from "../../brokers/finvasia/apis";

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
        const marketClosed = shortTime < 930 || shortTime >= 1458;

        // from aws
        // const data = await ddbClient.get();
        const { momentum, volatility, indiaSentiment, globalSentiment, orderType } = data;

        const buySellCall = buySellSignal(momentum, indiaSentiment, volatility, STATE, orderType);

        // finvasia
        const account = Account.getInstance();
        account.token = await api.login();

        if (STATE === 'STOP') {
            log.info('Service Stopped, Trading over for the day');
            sendNotification('Service Stopped, Trading over for the day');
        }
        else if (STATE === 'START') {
            // special case - TODO: convert to event
            if (marketClosed) {
                log.info('Market Closing Time ⌛, stopping the application');
                STATE = 'STOP';
                PENDING_TRADE_PER_DAY = 0;
                return;
            }

            if (buySellCall !== 'buy') {
                log.info(`No buy/sell signal in market! - Volatility ${volatility}`);
                return;
            }

            if (volatility?.toLowerCase().includes('less')) {
                log.info('No volatility in market!');
                return;
            }

            if (indiaSentiment !== globalSentiment) {
                log.info(`Local & Global Sentiments are different!`);
                return;
            }

            if (indiaSentiment === 'neutral') {
                log.info(`No signal in Indian market!`);
                return;
            }

            log.info(`Market is ${indiaSentiment} ✅, placing ${orderType} Order`);
            const order = await placeBuyOrder(orderType);

            ORDER_ID = order.orderId;
            TRADE_ID = Date.now();
            SCRIPT = order.script;
            ORDER_BUY_PRICE = +order.orderPrice;
            ORDER_LOT = +order.orderLot;
            ORDERED_SENTIMENT = indiaSentiment + '';
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
                    volatility,
                },
            );

            // special case - TODO: convert to event
            if (marketClosed) {
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

            log.debug({ ORDER_BUY_PRICE, lp, changePercent, absChangePercent, volatility });

            const canExit = canExitPosition(changePercent, volatility, ORDERED_SENTIMENT, indiaSentiment);

            if (canExit) {
                log.info(`${canExit ? 'Dynamic ': ''}P&L reached ${absChangePercent} with market strength ${volatility}, exiting the position`);

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
            if (buySellCall === 'hold') {
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
            log.error((err as Error).message);
        }

        sendNotification(`CORE - ${(err as Error).message}`);
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

    sendNotification(`Buy Order placed on ${script.values[0].tsym} - ${orderLot} nos.`);

    return { orderId: order, script: script.values[0].tsym, orderLot: orderLot, orderPrice: lastOrder?.avgprc, scriptToken: script.values[0].token };
}

const placeSellOrder = async (script: string, lot: number) => {
    const order = await api.placeOrder('S', script, lot);
    const orders = await api.orderList();
    const lastOrder = orders.find((d: any) => d.norenordno === order);

    sendNotification(`Exit Order placed on ${script} - ${lot} nos.`);

    return { orderId: order, script: script, sellPrice: +lastOrder?.avgprc };
}

const canExitPosition = (
    changePercent: number,
    volatility: string,
    orderedSentiment: string,
    currentSentiment: string,
) => {

    let maxProfitPerTrade = appConfig.maxProfitPerTrade;
    let maxLossPerTrade = appConfig.maxLossPerTrade;

    if (volatility.toLowerCase().includes('high')) {
        maxProfitPerTrade = maxProfitPerTrade * 2;
        maxLossPerTrade = maxLossPerTrade * 2;
    }
    else if (volatility.toLowerCase().includes('low')) {
        maxProfitPerTrade = maxProfitPerTrade / 2;
        maxLossPerTrade = maxLossPerTrade / 2;
    }

    log.info({ maxProfitPerTrade, maxLossPerTrade });

    if (changePercent > maxProfitPerTrade) {
        return true;
    } else if (changePercent < -maxLossPerTrade) {
        PENDING_LOSS_TRADE_PER_DAY--;
        return true;
    }

    return false;
}

const skipGlobalMarketSignal = (signal: string) => {
    let result = '';

    switch (signal) {
        case 'sell':
            result = 'PE';
            break;
        case 'buy':
            result = 'CE';
            break;
        default:
            result = '';
    }

    return result;
}

export const resetTrades = () => {
    STATE = 'START';
    PENDING_TRADE_PER_DAY = appConfig.maxTradesPerDay;
}
