const { getIndiaMarket } = require('../api');
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
        } else if (STATE === 'ORDERED' && script) {

            // special case
            if (parseInt(dayjs().format('HHmm')) > 1430) {
                console.log('Market Closing Time ⌛, exiting the position');
                orderId = await placeOrder('S', script);
                STATE = 'STOP';
                return;
            }

            const niftyTrend1Min = await getIndiaMarket(60);
            const niftyTrend5Min = await getIndiaMarket(300);

            if ((niftyTrend5Min.summary === 'buy' && niftyTrend1Min.summary === 'neutral')
                || (niftyTrend5Min.summary === 'neutral' && niftyTrend1Min.summary === 'sell')
             ) {
                console.log('Indian Market is negative ❌, exiting the position');
                orderId = await placeOrder('S', script);
                STATE = 'STOP';
            } else {
                console.log('Indian Market is positive ✅, holding the position');
            }

        } else if (STATE === 'START') {
            const globalMarket = await scrapGlobalMarket();

            const positiveMarketCount = globalMarket.globalData.filter((v, i) => v.changePercent > 0);

            if (positiveMarketCount.length < 4) {
                console.log('Global Market is Negative ❌');
                return;
            }

            console.log('Global Market is positive ✅');

            const niftyTrend1Min = await getIndiaMarket(60);
            const niftyTrend5Min = await getIndiaMarket(300);
            console.log(niftyTrend1Min, niftyTrend5Min);

            if ((niftyTrend5Min.summary === 'sell' && niftyTrend1Min.summary === 'neutral')
                || (niftyTrend5Min.summary === 'neutral' && niftyTrend1Min.summary === 'buy')
                || (niftyTrend5Min.summary === 'buy' && niftyTrend1Min.summary === 'buy')
             ) {
                console.log('Indian Market is positive ✅, Placing the Order 💹');
    
                const order = await placeOrder('B');
                orderId = order?.orderId;
                script = order?.script;
                STATE = 'ORDERED';
            } else {
                console.log('Indian Market is Negative ❌');
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
