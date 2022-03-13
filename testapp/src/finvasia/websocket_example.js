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

        if(res.stat !== 'Ok')
            return;
        
        params = {
          'socket_open' : open,
          'quote' : receiveQuote,   
          'order' : receiveOrders       
        }

        api.start_websocket(params);

        
        
    }).catch((err) => {
        console.error(err);
    });

