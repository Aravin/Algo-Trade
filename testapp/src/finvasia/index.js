const Api = require("./lib/RestApi");

let { authparams } = require("./cred");
const findNextExpiry = require('../common/expiryDate');

const api = new Api({});

const placeOrder = async (orderType, callPut, sellScript, lot) => {
    try {
        const login = await api.login(authparams);

        if (orderType === 'S') {
            const order = await api.place_order({buy_or_sell: orderType, product_type: 'M', exchange: 'NFO', tradingsymbol: sellScript, quantity: lot, discloseqty: 0, price_type: 'M', price: 0});

            return {orderId: order.norenordno, script: sellScript };
        }

        const limits = await api.get_limits();
        const margin = ((+limits.cash || +limits.payin) - +(limits.premium || 0) ) * 95/100;
        const {expiryDate, daysLeft} = findNextExpiry(); // external call
        const quote = await api.get_quotes('NSE', '26000');
        const niftyLastPrice = parseFloat(quote.lp);
        const strikePrice = (daysLeft * 100) + 200;
        const bestStrike = (Math.round(niftyLastPrice/100) * 100) + (callPut === 'CE' ? strikePrice : -strikePrice );
        const script = await api.searchscrip('NFO', `NIFTY ${expiryDate} ${bestStrike} ${callPut}`);
        const scriptQuote = await api.get_quotes('NFO', script.values[0].token);
        const scriptLastPrice = parseFloat(scriptQuote.lp);
        const scriptLot = +scriptQuote.ls;
        const requiredMargin = Math.ceil(scriptLastPrice * scriptLot);

        if (requiredMargin > margin) {
            throw new Error(`Insufficient fund to place order ${script.values[0].tsym}. Required Rs.${requiredMargin} - Available Rs. ${margin}`);
        }

        console.log('Placing Order');
        const orderLot = Math.floor(margin / (scriptLot * scriptLastPrice)) * scriptLot;
        const order = await api.place_order({buy_or_sell: orderType, product_type: 'M', exchange: 'NFO', tradingsymbol: script.values[0].tsym, quantity: orderLot, discloseqty: 0, price_type: 'M', price: 0});

        if (order.stat === 'Not_Ok') {
            throw new Error('Order placement failure');
        }
        
        const orders = await api.get_orderbook();
        const lastOrder = orders.find((d) => d.norenordno === order.norenordno);

        return {orderId: order.norenordno, script: script.values[0].tsym, orderLot: orderLot, orderPrice: lastOrder.avgprc };

    } catch (err) {
        throw new Error(err.message);
    }
}

const getPositionBook = async () => {
    const login = await api.login(authparams);
    return await api.get_positions();
}

module.exports = {
    placeOrder: placeOrder,
    getPositionBook: getPositionBook,
}