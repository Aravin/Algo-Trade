var sn = require('stocknotejsbridge');


sn.snapi.setSessionToken("c0e81b7f6616765c2a7fcf25a38906ae");    

var options = {
    "expiryDate": "2021-07-01",
    "optionType": sn.constants.OPTION_TYPE_PE,
    "strikePrice": "15750",
    "exchange": sn.constants.EXCHANGE_NFO
    };

sn.snapi.optionchain("NIFTY",options).then((data) => { console.log("OptionChain:" + data); }).catch((error) => { console.error(error) });