var sn = require('stocknotejsbridge');


sn.snapi.setSessionToken("c0e81b7f6616765c2a7fcf25a38906ae");    

// var options = {
//     "expiryDate": "2021-07-01",
//     "optionType": sn.constants.OPTION_TYPE_PE,
//     "strikePrice": "15750",
//     "exchange": sn.constants.EXCHANGE_NFO
//     };

var indexCandle = {
    "toDate": "2021-06-26"
    };
    
sn.snapi.indexHistoricalCandleData("NIFTY 50","2021-06-24",indexCandle).then((data) => { console.log("IndexHistoricalCandleData:" + data); }).catch((error) => { console.error(error) });