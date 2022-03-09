var axios = require("axios");


let config2 = {
  method: "get",
  url: "https://apiconnect.angelbroking.com/rest/secure/angelbroking/user/v1/getProfile",

  headers: {
    Authorization:
      "Bearer <replace bearer here>",
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "CLIENT_LOCAL_IP",
    "X-ClientPublicIP": "CLIENT_PUBLIC_IP",
    "X-MACAddress": "MAC_ADDRESS",
    "X-PrivateKey": "",
  },
};

axios(config2)
  .then(function (response) {
    console.log(JSON.stringify(response.data));
  })
  .catch(function (error) {
    console.log(error);
  });