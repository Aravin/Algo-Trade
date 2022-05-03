import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone  from 'dayjs/plugin/timezone';
import cron from 'node-cron';
import { ddbClient } from './helpers/db';
import { api } from './helpers/http';
import { Account } from './models/account';
import { findNextExpiry } from './shared/expirtyDate';
import log4js from 'log4js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Kolkata");
const log = log4js.getLogger()
log.level = 'debug';

const shortTime = +dayjs.tz(new Date()).format('HHMM');
const marketClosed = shortTime < 930 && shortTime > 1500;

let STATE = 'START';
let ORDER_ID = '';
let ORDER_BUY_PRICE = 0.0;
let ORDER_LOT = 50;
let SCRIPT = '';
let ORDERED_SENTIMENT = '';
let MAX_TRADE_PER_DAY = 10;
const MAX_PROFIT_PER_TRADE = 40;
const MAX_LOSS_PER_TRADE = 20;

cron.schedule('30-59/1 9 * * 1-5', () => {
    log.info(`Service Running... Order State: ${STATE} - ${dayjs().format('hh:mm:ss')}`);
    run();
}, { timezone: 'Asia/Kolkata' });

cron.schedule('* 10-15 * * 1-5', () => {
    log.info(`Service Running... Order State: ${STATE} - ${dayjs().format('hh:mm:ss')}`);
    run();
}, { timezone: 'Asia/Kolkata' });

const run = async () => {
    try {
        // from aws
        const data = await ddbClient.get();
        const indiaSentiment = data?.local;
        const signal = data?.signal
        const volatility = data?.volatility;


        if (!ORDERED_SENTIMENT && volatility?.toLowerCase().includes('less')) {
            log.info('No volatility in market!');
            return;
        }

        // finvasia
        const account = Account.getInstance();
        account.token = await api.login();

        if (STATE === 'STOP') {
            if (MAX_TRADE_PER_DAY) {
                STATE = 'START';
            } else {
                log.info('Order closed. No Action needed');
            }
        }
        else if (STATE === 'START') {
            // special case - TODO: convert to event
            if (marketClosed) {
                log.info('Market Closing Time ⌛, stop the application');
                STATE = 'STOP';
                MAX_TRADE_PER_DAY = 0;
                return;
            }

            const callOrPut = signal?.includes('Call') ? 'CE' : 'PE';

            log.info(`Market is ${indiaSentiment} ✅, placing ${callOrPut} Order`);
            const order = await placeBuyOrder(callOrPut);

            ORDER_ID = order.orderId;
            SCRIPT = order.script;
            ORDER_BUY_PRICE = +order.orderPrice;
            ORDER_LOT = +order.orderLot;
            ORDERED_SENTIMENT = indiaSentiment + '';
            STATE = 'ORDERED';

            ddbClient.insertTradeLog({orderId: ORDER_ID, script: SCRIPT, buyPrice: ORDER_BUY_PRICE, lotSize: ORDER_LOT});
        }
        else if (STATE === 'ORDERED' && SCRIPT && ORDER_ID) {
            // special case - TODO: convert to event
            if (marketClosed) {
                log.info('Market Closing Time ⌛, exiting the position');
                const { orderId, sellPrice } = await placeSellOrder(SCRIPT, ORDER_LOT);
                const changePercent = (((sellPrice - ORDER_BUY_PRICE) / ORDER_BUY_PRICE) * 100).toFixed(2);
                ddbClient.exitTradeLog({orderId, sellPrice, pnl: changePercent, exitReason: 'Market Closing'});
                STATE = 'STOP';
                MAX_TRADE_PER_DAY = 0;
                return;
            }

            // exit in case of loss
            const positions = await api.orderPositions();
            const { lp, urmtom } = positions.find((d: any) => d.tsym = SCRIPT);
            const changePercent = (((parseFloat(lp) - ORDER_BUY_PRICE) / ORDER_BUY_PRICE) * 100);
            const absChangePercent = changePercent.toFixed(2);
            log.debug({ ORDER_BUY_PRICE, lp, urmtom, changePercent });

            if (changePercent > MAX_PROFIT_PER_TRADE || changePercent < -MAX_LOSS_PER_TRADE) {
                log.info(`P&L reached ${changePercent}, exiting the position`);
                const { orderId, sellPrice } = await placeSellOrder(SCRIPT, ORDER_LOT);
                ddbClient.exitTradeLog({orderId, sellPrice, pnl: absChangePercent, exitReason: `P&L reached ${changePercent}`});
                STATE = 'STOP';
                MAX_TRADE_PER_DAY = MAX_TRADE_PER_DAY - 1;
                return;
            }

            if (indiaSentiment === ORDERED_SENTIMENT) {
                log.info(`Indian Market is ${ORDERED_SENTIMENT} ✅, holding the position`);
                return;
            }

            log.info(`Indian Market is ${indiaSentiment} ❌, exiting the position`);
            const { orderId, sellPrice } = await placeSellOrder(SCRIPT, ORDER_LOT);
            ddbClient.exitTradeLog({orderId, sellPrice, pnl: absChangePercent, exitReason: 'Sentiment Changed'});
            STATE = 'STOP';
            MAX_TRADE_PER_DAY = MAX_TRADE_PER_DAY - 1;

        }
    }
    catch (err: any) {
        log.error(err?.message);
        log.error('Error: Retry at next attempt. ');
    }
}

const placeBuyOrder = async (callOrPut: string) => {
    const limits = await api.accountLimit();
    const margin = ((+(limits.cash || 0) + +(limits.payin || 0)) - +(limits.premium || 0)) * 95 / 100;
    const { expiryDate, daysLeft } = findNextExpiry();
    const quote = await api.scriptQuote('NSE', '26000');
    const niftyLastPrice = parseFloat(quote.lp);
    const strikePrice = (daysLeft * 100) + 200;
    const bestStrike = (Math.round(niftyLastPrice / 100) * 100) + (callOrPut === 'CE' ? strikePrice : -strikePrice);
    const script = await api.scriptSearch(`NIFTY ${expiryDate} ${bestStrike} ${callOrPut}`);
    const scriptQuote = await api.scriptQuote('NFO', script.values[0].token);
    const scriptLastPrice = parseFloat(scriptQuote.lp);
    const scriptLot = +scriptQuote.ls;
    const requiredMargin = Math.ceil(scriptLastPrice * scriptLot);

    if (requiredMargin > margin) {
        throw new Error(`Insufficient fund to place order ${script.values[0].tsym}. Required Rs.${requiredMargin} - Available Rs. ${margin}`);
    }

    const orderLot = Math.floor(margin / (scriptLot * scriptLastPrice)) * scriptLot;
    const order = await api.placeOrder('B', script.values[0].tsym, orderLot);
    const orders = await api.orderList();
    const lastOrder = orders.find((d: any) => d.norenordno === order);

    return { orderId: order, script: script.values[0].tsym, orderLot: orderLot, orderPrice: lastOrder?.avgprc };
}

const placeSellOrder = async (script: string, lot: number) => {
    const order = await api.placeOrder('S', script, lot);
    const orders = await api.orderList();
    const lastOrder = orders.find((d: any) => d.norenordno === order);

    return { orderId: order, script: script, sellPrice: +lastOrder?.avgprc };
}
