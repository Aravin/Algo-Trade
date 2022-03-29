const Api = require("./lib/RestApi");

let { authparams } = require("./cred");
const findNextExpiry = require('../common/expiryDate');

api = new Api({});

const placeOrder = async (orderType, callPut, sellScript) => {
    try {
        const login = await api.login(authparams);

        if (orderType === 'S') {
            const order = await api.place_order({buy_or_sell: orderType, product_type: 'M', exchange: 'NFO', tradingsymbol: sellScript, quantity: 50, discloseqty: 0, price_type: 'M', price: 0});

            return {orderId: order.norenordno, script: sellScript };
        }

        const limits = await api.get_limits();

        const margin = (parseFloat(limits.cash) || parseFloat(limits.payin)) * 97/100;

        const expiryDate = findNextExpiry(); // external call

        const quote = await api.get_quotes('NSE', '26000');

        const niftyLastPrice = parseFloat(quote.lp);

        const bestStrike = (Math.round(niftyLastPrice/100) * 100) + (callPut === 'CE' ? 300 : -300 );

        const script = await api.searchscrip('NFO', `NIFTY ${expiryDate} ${bestStrike} ${callPut}`);

        const scriptQuote = await api.get_quotes('NFO', script.values[0].token);

        const scriptLastPrice = parseFloat(scriptQuote.lp);

        const scriptLot = +scriptQuote.ls;

        if (scriptLastPrice * scriptLot < margin) {
            console.log('Placing Order');
            const order = await api.place_order({buy_or_sell: orderType, product_type: 'M', exchange: 'NFO', tradingsymbol: script.values[0].tsym, quantity: scriptLot, discloseqty: 0, price_type: 'M', price: 0});
            
            const orders = await api.get_orderbook();
            const lastOrder = orders.find((d) => d.norenordno === order.norenordno);

            return {orderId: order.norenordno, script: script.values[0].tsym, orderPrice: lastOrder.avgprc };
        } else {
            console.log(`Insufficient fund to place order. Required Rs.${Math.round(scriptLastPrice * scriptLot)} - Available Rs. ${margin}`);
            return null;
        }
    } catch (err) {
        console.log(err);
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