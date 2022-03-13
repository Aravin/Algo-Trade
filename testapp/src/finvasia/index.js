const Api = require("./lib/RestApi");

let { authparams } = require("./cred");
const findNextExpiry = require('../common/index');

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

async function placeOrder() {
    try {
        const login = await api.login(authparams);

        const limits = await api.get_limits();

        const margin = parseFloat(limits.cash) || parseFloat(limits.payin) * 80/100;

        const expiryDate = findNextExpiry(); // external call

        const quote = await api.get_quotes('NSE', '26000');

        console.log(quote);

        const niftyLastPrice = parseFloat(quote.lp);

        const bestStrike = (Math.round(niftyLastPrice/100) * 100) + 200;

        const script = await api.searchscrip('NFO', `NIFTY ${expiryDate} ${bestStrike} CE`);

        const scriptQuote = await api.get_quotes('NFO', script.values[0].token);

        const scriptLastPrice = parseFloat(scriptQuote.lp);

        const scriptLot = parseFloat(scriptQuote.ls);

        console.log(script.values[0].tsym)

        if (scriptLastPrice * scriptLot < margin) {
            console.log('Placing Order');
            const order = await api.place_order({buy_or_sell: 'B', product_type: 'M', exchange: 'NFO', tradingsymbol: script.values[0].tsym, quantity: scriptLot, discloseqty: 0, price_type: 'M', price: scriptLastPrice});
        } else {
            console.log('Insufficient fund to place order.');
        }
        
        console.log(margin, niftyLastPrice, scriptLastPrice);
    } catch (err) {
        console.log(err);
    }
}

placeOrder();