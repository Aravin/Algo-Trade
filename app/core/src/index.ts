import dayjs from 'dayjs';
import cron from 'node-cron';
import { ddbClient } from './helpers/db';
import { api } from './helpers/http';
import { Account } from './models/account';
import { findNextExpiry } from './shared/expirtyDate';

let STATE = 'START';
let ORDER_ID = '';
let ORDER_BUY_PRICE = 0.0;
let ORDER_LOT = 50;
let SCRIPT = '';
let ORDERED_SENTIMENT = '';
let MAX_TRADE_PER_DAY = 10;
const MAX_PROFIT_PER_TRADE = 40;
const MAX_LOSS_PER_TRADE = 20;

cron.schedule('* 4-10 * * 1-5', () => {
    console.log(`Service Running... Order State: ${STATE} - ${dayjs().format('hh:mm:ss')}`);
    run();
});

const run = async () => {
    try {
        // from aws
        const data = await ddbClient.get();
        const indiaSentiment = data?.local;
        const signal = data?.signal

        // finvasia
        const account = Account.getInstance();
        account.token = await api.login();

        if (STATE === 'STOP') {
            if (MAX_TRADE_PER_DAY) {
                STATE = 'START';
            } else {
                console.log('Order closed. No Action needed');
            }
        }
        else if (STATE === 'START') {
            // special case - TODO: convert to event
            if (parseInt(dayjs().format('HHmm')) > 1000) {
                console.log('Market Closing Time ⌛, stop the application');
                STATE = 'STOP';
                MAX_TRADE_PER_DAY = 0;
                return;
            }

            const callOrPut = signal?.includes('Call') ? 'CE' : 'PE';

            console.log(`Market is ${indiaSentiment} ✅, placing ${callOrPut} Order 💹`);
            const order = await placeBuyOrder(callOrPut);


            ORDER_ID = order.orderId;
            SCRIPT = order.script;
            ORDER_BUY_PRICE = +order.orderPrice;
            ORDER_LOT = +order.orderLot;
            ORDERED_SENTIMENT = indiaSentiment + '';
            STATE = 'ORDERED';
        }
        else if (STATE === 'ORDERED' && SCRIPT && ORDER_ID) {
            // special case - TODO: convert to event
            if (parseInt(dayjs().format('HHmm')) > 1000) {
                console.log('Market Closing Time ⌛, exiting the position');
                await placeSellOrder(SCRIPT, ORDER_LOT);
                STATE = 'STOP';
                MAX_TRADE_PER_DAY = 0;
                return;
            }

            // exit in case of loss
            const positions = await api.orderPositions();
            const { daybuyqty, netavgprc, daybuyamt, lp, urmtom } = positions.find((d: any) => d.tsym = SCRIPT);
            const changePercent = ((parseFloat(lp) - ORDER_BUY_PRICE) / ORDER_BUY_PRICE) * 100;
            console.log({ ORDER_BUY_PRICE, lp, urmtom, changePercent });

            if (changePercent > MAX_PROFIT_PER_TRADE || changePercent < -MAX_LOSS_PER_TRADE) {
                console.log(`P&L reached ${changePercent}, exiting the position`);
                await placeSellOrder(SCRIPT, ORDER_LOT);
                STATE = 'STOP';
                MAX_TRADE_PER_DAY = MAX_TRADE_PER_DAY - 1;
                return;
            }

            if (indiaSentiment === ORDERED_SENTIMENT) {
                console.log(`Indian Market is ${ORDERED_SENTIMENT} ✅, holding the position`);
                return;
            }

            console.log(`Indian Market is ${indiaSentiment} ❌, exiting the position`);
            await placeSellOrder(SCRIPT, ORDER_LOT);
            STATE = 'STOP';
            MAX_TRADE_PER_DAY = MAX_TRADE_PER_DAY - 1;

        }
    }
    catch (err: any) {
        console.log(err?.message);
        console.log('Error: Retry at next attempt. ');
    }
}

const placeBuyOrder = async (callOrPut: string) => {
    const limits = await api.accountLimit();
    const margin = ((+limits.cash || +limits.payin) - +(limits.premium || 0)) * 95 / 100;
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

    return { orderId: order, script: script };
}
