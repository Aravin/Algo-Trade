var axios = require("axios");

// HTTP call to get bearer, token //
var data = JSON.stringify({
  clientcode: "",
  password: "",
});

var config = {
  method: "post",
  url: "https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "10.10.10.10",
    "X-ClientPublicIP": "10.10.10.10",
    "X-MACAddress": "MAC_ADDRESS",
    "X-PrivateKey": "",
  },
  data: data,
};

axios(config)
  .then(function (response) {
    // console.log(JSON.stringify(response.data));

    // const jwtToken = JSON.stringify(response.data)
    console.log(response.data.data.jwtToken);
    jwtToken = response.data.data.jwtToken;
  })
  .catch(function (error) {
    console.log(error);
  });

