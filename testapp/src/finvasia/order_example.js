const Api = require("./lib/RestApi");

let { authparams } = require("./cred");

api = new Api({});

function receiveQuote(data) {
    console.log("Quote ::", data);
}

function receiveOrders(data) {
    console.log("Order ::", data);
}

function open(data) {
    let instruments = 'NSE|22#BSE|500400';
    api.subscribe(instruments)
    console.log("subsribing to :: ", instruments);
}

api.login(authparams)
.then((res) => {        
        //cons//ole.log('Reply: ', res);
        params = {
          'socket_open' : open,
          'quote' : receiveQuote,   
          'order' : receiveOrders       
        }

        api.start_websocket(params);

        
        //place order
        let orderparams = {
            'buy_or_sell' : 'B',
            'product_type' : 'C',
            'exchange' : 'NSE',
            'tradingsymbol'  :  'CANBK-EQ',
            'quantity' : 1,
            'discloseqty' : 0,
            'price_type' : 'LMT',
            'price' : 175.0
        };

        api.place_order(orderparams)
            .then((reply) => { 
                console.log(reply);            

        let modifyparams = {
            'orderno' : reply.norenordno,
            'exchange' : 'NSE',
            'tradingsymbol' : 'CANBK-EQ',
            'newquantity' : 2,
            'newprice_type' : 'LMT',
            'newprice' : 176.00
        }

        api.modify_order(modifyparams)
            .then((modreply) => { 
                    console.log(modreply);
                    api.cancel_order(modreply.result);
                });
        });

        api.get_orderbook()
        .then((reply) => { 
            console.log(reply);
        });
        
    }).catch((err) => {
        console.error(err);
    });

