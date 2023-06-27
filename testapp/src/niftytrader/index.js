const axios = require("axios");

// pcr >= 1.6 overbought
// pcr <= 0.6 oversold
const NIFTYTRADER_PCR = 'https://webapi.niftytrader.in/webapi/option/oi-data?reqType=niftyoilist&reqDate=';


const main = async () => {
    const response = await axios.get(NIFTYTRADER_PCR);
    let result = analyzePCR(response.data.resultData.oiPcrData.pcr);
    console.log(result);
}

const analyzePCR = (pcr) => {
    if (pcr === 1) {
        return 'neutral'
    } else if (pcr > 1 && pcr < 1.6) {
        return 'buy';
    } else if (pcr >= 1.6) {
        return 'overbought';
    } else if (pcr < 1 && pcr > 0.6) {
        return 'sell';
    } else if (pcr <= 0.6) {
        return 'oversold';
    }
}

main();
