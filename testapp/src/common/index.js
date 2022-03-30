const { getIndiaMarket } = require('../api');
const { scrapGlobalMarket } = require('../webscrap/cheerio');
const cron = require('node-cron');
const apis = require('../finvasia/index');
const dayjs = require('dayjs');

let STATE = 'START';
let ORDER_ID = null;
let ORDER_BUY_PRICE = 0.0;
let ORDER_LOT = 50;
let SCRIPT = null;
let ORDERED_SENTIMENT = null;
let MAX_TRADE_PER_DAY = 3;
const MAX_PROFIT_PER_TRADE = 50;
const MAX_LOSS_PER_TRADE = 25;

const getGlobalSentiment = async () => {
    const globalMarketData = await scrapGlobalMarket();
    const currentTimeHHmm = parseInt(dayjs().format('HHmm'));
    let globalMarket = globalMarketData.globalData;
    let marketToWatch = ['US'];
    let positiveMarketCount = 0;
    let negativeMarketCount = 0;
    let averagePercentage = 0.0;

    if (currentTimeHHmm >= 0900 && currentTimeHHmm < 1230) {
        marketToWatch.push('Asia');
    }
    else if (currentTimeHHmm >= 1230 && currentTimeHHmm < 1600) {
        marketToWatch.push('Europe');
    }

    const activeMarket = globalMarket.filter((v, i) => marketToWatch.includes(v.market));

    for (const market of activeMarket) {
        market.changePercent > 0.0 ? positiveMarketCount++ : negativeMarketCount++;
        averagePercentage = averagePercentage + market.changePercent;
    }

    if (positiveMarketCount > negativeMarketCount) {
        return 'positive';
    }
    else if (negativeMarketCount > positiveMarketCount) {
        return 'negative';
    }
    else if (averagePercentage > 0) {
        return 'positive';
    }
    else if (averagePercentage < 0) {
        return 'negative';
    }

    return 'neutral';
}

const getIndiaSentiment = async () => {
    const niftyTrend1Min = await getIndiaMarket(60);
    const niftyTrend5Min = await getIndiaMarket(300);
    console.log({ _5min: niftyTrend5Min.summary, _1min: niftyTrend1Min.summary});

    if ((niftyTrend5Min.summary === 'strong sell' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'sell' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'neutral' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'buy' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'strong buy' && niftyTrend1Min.summary === 'strong buy') // risk
    ) {
        return 'positive';
    }
    else if ((niftyTrend5Min.summary === 'strong buy' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'buy' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'neutral' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'sell' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'strong sell' && niftyTrend1Min.summary === 'strong sell')
    ) {
        return 'negative';
    }

    return 'neutral';
}

const startAlgoTrade = async () => {
    try {
        if (STATE === 'STOP') {
            if (MAX_TRADE_PER_DAY) {
                STATE = 'START';
            } else {
                console.log('Order closed. No Action needed');
            }
        }
        else if (STATE === 'START') {
            const globalSentiment = await getGlobalSentiment();
            const indiaSentiment = await getIndiaSentiment();
            let callOrPut = '';

            if (globalSentiment !== indiaSentiment) {
                console.log(`Global sentiment is ${globalSentiment}, Indian Sentiment is ${indiaSentiment}`);
                return;
            }
            else if (new Set([globalSentiment, indiaSentiment, 'positive']).size === 1) {
                callOrPut = 'CE';
            }
            else if (new Set([globalSentiment, indiaSentiment, 'negative']).size === 1) {
                callOrPut = 'PE';
            }

            console.log(`Market is ${indiaSentiment} ✅, placing ${callOrPut} Order 💹`);
            const order = await apis.placeOrder('B', callOrPut);
            ORDER_ID = order.orderId;
            SCRIPT = order.script;
            ORDER_BUY_PRICE = +order.orderPrice;
            ORDER_LOT = +order.orderLot;
            ORDERED_SENTIMENT = indiaSentiment;
            STATE = 'ORDERED';
        }
        else if (STATE === 'ORDERED' && SCRIPT && ORDER_ID) {
            // special case - TODO: convert to event
            if (parseInt(dayjs().format('HHmm')) > 1500) {
                console.log('Market Closing Time ⌛, exiting the position');
                ORDER_ID = await apis.placeOrder('S', null, SCRIPT, ORDER_LOT);
                STATE = 'STOP';
                MAX_TRADE_PER_DAY = 0;
                return;
            }

            // exit in case of loss
            const positions = await apis.getPositionBook();
            const { daybuyqty, netavgprc, daybuyamt, lp, urmtom } = positions?.find((d) => d.tsym = SCRIPT);
            const changePercent = ((parseFloat(lp) - ORDER_BUY_PRICE) / parseFloat(ORDER_BUY_PRICE)) * 100;
            console.log({ORDER_BUY_PRICE, lp, urmtom, changePercent});

            if (changePercent > MAX_PROFIT_PER_TRADE || changePercent < -MAX_LOSS_PER_TRADE) {
                console.log(`P&L reached ${changePercent}, exiting the position`);
                ORDER_ID = await apis.placeOrder('S', null, SCRIPT, ORDER_LOT);
                STATE = 'STOP';
                MAX_TRADE_PER_DAY = MAX_TRADE_PER_DAY - 1;
                return;
            }

            const indiaSentiment = await getIndiaSentiment();

            if (indiaSentiment === ORDERED_SENTIMENT) {
                console.log(`Indian Market is ${ORDERED_SENTIMENT} ✅, holding the position`);
                return;
            }

            console.log(`Indian Market is ${indiaSentiment} ❌, exiting the position`);
            ORDER_ID = await apis.placeOrder('S', null, SCRIPT, ORDER_LOT);
            STATE = 'STOP';
            MAX_TRADE_PER_DAY = MAX_TRADE_PER_DAY - 1;

        }
    }
    catch (err) {
        console.log(err.message);
        console.log('Error: Retry after 1 min. ');
    }
}

cron.schedule('* * * * *', () => {
    console.log(`Service Running... Order State: ${STATE} - ${dayjs().format('hh:mm:ss')}`);
    startAlgoTrade();
});
