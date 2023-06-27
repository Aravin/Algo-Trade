const axios = require("axios");

const NSE_NIFTY50 = 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050';


const main = async () => {
    const response = await axios.get(NSE_NIFTY50);
    const sentiment = niftySentiment(response.data.advance);
    console.log(sentiment);
}

const niftySentiment = (data) => {
    let sentiment = 'very bearish';

    // const adv = parseInt(data.advances, 10);
    let adv = 5;

    if (adv > 40) {
        sentiment = 'very bullish' 
    } else if (adv > 30 && adv < 41) {
        sentiment = 'bullish'
    } else if (adv > 20 && adv < 31) {
        sentiment = 'neutral'
    } else if (adv > 10 && adv < 21) {
        sentiment = 'bearish'
    }

    return sentiment;
}

main();
