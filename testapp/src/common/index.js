const { getIndiaMarket } = require('../api');
const { scrapGlobalMarket } = require('../webscrap/cheerio');
const cron = require('node-cron');
const apis = require('../finvasia/index');
const getPositionBook = require('../finvasia/index');
const dayjs = require('dayjs');

let STATE = 'START';
let orderId = null || '2203210009110';
let script = null || 'NIFTY24MAR22C17700';

const getGlobalSentiment = async () => {
    const globalMarketData = await scrapGlobalMarket();
    let globalMarket = globalMarketData.globalData;
    let marketToWatch = ['US', 'Europe'];
    const currentTimeHHmm = parseInt(dayjs().format('HHmm'));
    let positiveMarketCount = 0;
    let negativeMarketCount = 0;
    let averagePercentage = 0.0;

    if (currentTimeHHmm >= 0900 && currentTimeHHmm < 1230) {
        marketToWatch.push('Asia');

    } else if (currentTimeHHmm >= 1230 && currentTimeHHmm < 1600) {
        marketToWatch.push('Europe');
    }

    const activeMarket = globalMarket.filter((v, i) => marketToWatch.includes(v.market));

    for (let market of activeMarket) {
        market.changePercent > 0.0 ? positiveMarketCount++ : negativeMarketCount++;
        averagePercentage = averagePercentage + market.changePercent;
    }

    if (positiveMarketCount > negativeMarketCount) {
        return 'positive';
    } else if (negativeMarketCount > positiveMarketCount) {
        return 'negative';
    } else if (averagePercentage > 0) {
        return 'positive';
    } else if (averagePercentage < 0) {
        return 'negative';
    }

    return 'neutral';
}

const getIndiaSentiment = async () => {
    const niftyTrend1Min = await getIndiaMarket(60);
    const niftyTrend5Min = await getIndiaMarket(300);

    if ((niftyTrend5Min.summary === 'sell' && ['neutral', 'buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'neutral' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'buy' && ['buy', 'strong buy'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'strong buy' && niftyTrend1Min.summary === 'strong buy') // risk
    ) {
        return 'positive';
    } else if ((niftyTrend5Min.summary === 'strong buy' && ['buy', 'neutral', 'sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'buy' && ['neutral', 'sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'neutral' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'neutral' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'sell' && ['sell', 'strong sell'].includes(niftyTrend1Min.summary))
        || (niftyTrend5Min.summary === 'strong sell' && ['strong sell'].includes(niftyTrend1Min.summary))
    ) {
        return 'negative';
    }

    return 'neutral';
}

const startAlgoTrade = async () => {
    try {
        if (STATE === 'START') {

            const globalSentiment = await getGlobalSentiment();
            const indiaSentiment = await getIndiaSentiment();

            if (globalSentiment !== indiaSentiment) {
                console.log('Global and Indian Sentiment are different!');
                return;
            }

            if (new Set([globalSentiment, indiaSentiment, 'positive']).size === 1) {
                // place call order
                console.log('Market is positive ✅, placing call Order 💹');
                const order = await apis.placeOrder('B', 'CE');
                orderId = order.orderId;
                script = order.script;
                STATE = 'ORDERED';
            }

            if (new Set([globalSentiment, indiaSentiment, 'negative']).size === 1) {
                // place put order
                console.log('Market is negative ✅, placing put Order 💹');
                const order = await apis.placeOrder('B', 'PE');
                orderId = order.orderId;
                script = order.script;
                STATE = 'ORDERED';
            }
        }
        else if (STATE === 'ORDERED' && script && orderId) {
            // special case - TODO: convert to event.
            if (parseInt(dayjs().format('HHmm')) > 1500) {
                console.log('Market Closing Time ⌛, exiting the position');
                orderId = await placeOrder('S', null, script);
                STATE = 'STOP';
                return;
            }

            // exit in case of loss
            const positions = await apis.getPositionBook();
            const { daybuyqty, netavgprc, daybuyamt, lp, urmtom } = positions?.find((d) => d.tsym = script);

            const changePercent = ((parseFloat(lp) - parseFloat(netavgprc)) / parseFloat(netavgprc)) * 100;
            console.log(daybuyqty, netavgprc, daybuyamt, lp, urmtom, changePercent);

            if (changePercent > 50 || changePercent < -25) {
                console.log('Indian Market is negative ❌, exiting the position');
                orderId = await apis.placeOrder('S', script);
                STATE = 'STOP';
                return;
            }

            const indiaSentiment = await getIndiaSentiment();

            if (indiaSentiment === 'negative') {
                console.log('Indian Market is negative ❌, exiting the position');
                orderId = await apis.placeOrder('S', script);
                STATE = 'STOP';
            } else {
                console.log('Indian Market is positive ✅, holding the position');
            }

        } else if (STATE === 'STOP') {
            console.log('Order closed. No Action needed');
            return;
        }
    } catch (err) {
        console.log(err.message);
        console.log('Error: Retry after 1 min. ');
    } finally {
    }
}

cron.schedule('* * * * *', () => {
    console.log(`Service Running... Order State: ${STATE} - ${dayjs().format('hh:mm:ss')}`);
    // startAlgoTrade();
});
startAlgoTrade();
