var axios = require("axios");


var data = JSON.stringify({
  exchange: "NSE",
  symboltoken: "3045",
  interval: "ONE_MINUTE",
  fromdate: "2021-05-27 09:15",
  todate: "2021-05-27 11:00",
});

// HTTP call to get Candle data //
var config = {
  method: "post",
  url: "https://apiconnect.angelbroking.com/rest/secure/angelbroking/historical/v1/getCandleData",
  headers: {
    "X-PrivateKey": "",
    Accept: "application/json, application/json",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "10.10.10.10",
    "X-ClientPublicIP": "10.10.10.10",
    "X-MACAddress": "MAC_ADDRESS",
    "X-UserType": "USER",
    Authorization:
      "Bearer <replace bearer here>",
    "Content-Type": "application/json",
  },
  data: data,
};

function callHistory() {
  axios(config)
  .then(function (response) {
    console.log(JSON.stringify(response.data));
  })
  .catch(function (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.log(error.response.data);
      console.log(error.response.status);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log("Error", error.message);
    }
    console.log(error.config);
  });
}

setInterval(() => {
  callHistory();
}, 1000);
