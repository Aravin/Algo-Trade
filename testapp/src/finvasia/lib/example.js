const axios = require('axios');
var sha256 = require("crypto-js/sha256");
/* 
  pwd: '18fcbfe9458001644e773ddee2d0681928673c1315841cfc8572db3f33a62edf', 
*/


 var password = sha256('Zxc@1234').toString();

const data = {
    uid: 'MOBKUMAR',    
    pwd: password,
    factor2: '01011970',
    vc: 'IDART_DESK',
    appkey: 'c5e717e2717fb80c6c75f4b1cba6fc79dbf533a7e73b6bb86f03e67438ef19ee',
    apkversion: '1.0.0',
    source: 'API',
    imei: 'xyz12345'
};

const jData = 'jData=' + JSON.stringify(data);

// Sending post data to API URL
axios.post('http://kurma.kambala.co.in:9959/NorenWClient/QuickAuth/', jData)
    .then((res) => {
        console.log(`Status: ${res.status}`);
        console.log('Body: ', res.data);
    }).catch((err) => {
        console.error(err);
    });
