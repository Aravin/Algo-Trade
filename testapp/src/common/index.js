const { scrapGlobalMarket } = require('../webscrap/cheerio');
const cron = require('node-cron');
const placeOrder = require('../finvasia/index');
const dayjs = require('dayjs');

let STATE = 'START';
let orderId = null;
let script = null;

const startAlgoTrade = async () => {
    try {
        if (STATE === 'STOP') {
            console.log('Order closed. No Action needed');
            return;
        } else if (STATE === 'ORDERED') {
            const globalMarket = await scrapGlobalMarket();

            if (script && (globalMarket.marketSentiment.includes('sell') || parseInt(dayjs().format('HHmm')) > 1430)) {
                console.log('Market is negative ❌, closing the order');
                orderId = await placeOrder('S', script);
                STATE = 'STOP';
            } else {
                console.log('Market is positive ✅, holding the position');
            }

        } else if (STATE === 'START') {
            const globalMarket = await scrapGlobalMarket();

            const positiveMarketCount = globalMarket.globalData.filter((v, i) => v.changePercent > 0);

            if (positiveMarketCount.length >= 4 && globalMarket.marketSentiment.includes('buy')) {
                console.log('Market is positive ✅, placing the order');
                const order = await placeOrder('B');

                if (order?.orderId) {
                    orderId = order?.orderId;
                    script = order?.script;
                    STATE = 'ORDERED';
                }

            } else {
                console.log('Market is Negative ❌');
            }
        }
    } catch (err) {
        console.log(err.message);
    } finally {
        console.log('Retry after 1 min. ');
    }
}

cron.schedule('* * * * *', () => {
    console.log(`Service Running... Order State: ${STATE} - ${dayjs().format('hh:mm:ss')}`);
    startAlgoTrade();
});
