const Api = require("./lib/RestApi");

let { authparams } = require("./cred");
const findNextExpiry = require('../common/expiryDate');

api = new Api({});

// api.login(authparams)
//     .then((res) => {
//         console.log('Login Reply: ', res);

//         if (res.stat !== 'Ok')
//             return;

//         //search scrip example
//         // api.searchscrip('NFO', 'NIFTY 17900 CE').then((reply) => { console.log(reply); });

//         api.get_limits().then((reply) => { console.log(reply); });

//     }).catch((err) => {
//         console.error(err);
//     });

const placeOrder = async (orderType, sellScript) => {
    try {
        const login = await api.login(authparams);

        if (orderType === 'S') {
            const order = await api.place_order({buy_or_sell: orderType, product_type: 'M', exchange: 'NFO', tradingsymbol: sellScript, quantity: 50, discloseqty: 0, price_type: 'M', price: 0});

            return {orderId: order.norenordno, script: sellScript };
        }

        const limits = await api.get_limits();

        const margin = (parseFloat(limits.cash) || parseFloat(limits.payin)) * 90/100;

        const expiryDate = findNextExpiry(); // external call

        const quote = await api.get_quotes('NSE', '26000');

        const niftyLastPrice = parseFloat(quote.lp);

        const bestStrike = (Math.round(niftyLastPrice/100) * 100) + 300;

        const script = await api.searchscrip('NFO', `NIFTY ${expiryDate} ${bestStrike} CE`);

        const scriptQuote = await api.get_quotes('NFO', script.values[0].token);

        const scriptLastPrice = parseFloat(scriptQuote.lp);

        const scriptLot = parseFloat(scriptQuote.ls);

        if (scriptLastPrice * scriptLot < margin) {
            console.log('Placing Order');
            const order = await api.place_order({buy_or_sell: orderType, product_type: 'M', exchange: 'NFO', tradingsymbol: script.values[0].tsym, quantity: scriptLot, discloseqty: 0, price_type: 'M', price: 0});

            return {orderId: order.norenordno, script: script.values[0].tsym };
        } else {
            console.log(`Insufficient fund to place order. Required Rs.${Math.round(scriptLastPrice * scriptLot)} - Available Rs. ${margin}`);
            return null;
        }
        
        console.log(margin, niftyLastPrice, scriptLastPrice);
    } catch (err) {
        console.log(err);
    }
}

const getPositionBook = async () => {
    const login = await api.login(authparams);

    const positionBook = await api.get_positions();
    // console.log(positionBook);

    return positionBook;
}

// getPositionBook();

// placeOrder();

module.exports = {
    placeOrder: placeOrder,
    getPositionBook: getPositionBook,
}