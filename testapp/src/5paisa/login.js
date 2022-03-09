// Configuration for your app
const conf = {
    "appSource": "5055",
    "appName": "",
    "userId": "",
    "password": "",
    "userKey": "",
    "encryptionKey": ""
}

const { FivePaisaClient } = require("5paisajs")

var client = new FivePaisaClient(conf)

// This client object can be used to login multiple users.
client.login("", "", "").then((response) => {
    client.init(response).then(() => {
        // Fetch holdings, positions or place orders here.
        // Some things to try out are given below.
        // console.log(response);


        a=[
            {"Exch":"N","ExchType":"C","Symbol":"BHEL","Expiry":"","StrikePrice":"0","OptionType":""},
			{"Exch":"N","ExchType":"C","Symbol":"RELIANCE","Expiry":"","StrikePrice":"0","OptionType":""},
			{"Exch":"N","ExchType":"C","Symbol":"AXISBANK","Expiry":"","StrikePrice":"0","OptionType":""}]
        
        
        client.getMarketFeed(a).then((response) => {
                    console.log(response, a)
                }).catch((err) => {
                    console.log(err)
                });

    })
}).catch((err) =>{
    // Oh no :/
    console.log(err)
})

