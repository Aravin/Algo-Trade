const axios = require("axios");

const MC_PRICEAPI = 'https://priceapi.moneycontrol.com/technicalCompanyData/globalMarket/getGlobalIndicesListingData?view=overview&deviceType=W';


const main = async () => {
    const response = await axios.get(MC_PRICEAPI);
    const transformedData = transformPriceApiData(response.data)
    evaluateMarketCondition(transformedData);
}

const transformPriceApiData = (apiData) => {
    const header = apiData.header;
    const result = [];

    apiData.dataList.forEach((data) => {
        if (data.data) {
            // console.log(data.heading);
            data.data.forEach((eachData, j) => {
                const eachMarket = {
                    region: data.heading,
                };
                eachData.forEach((val, k) => {
                    // console.log(header[k].name, val);
                    eachMarket[header[k].name] = val;
                });

                result.push(eachMarket);
            })
        }

    });

    console.log(result);
    return result;
}

const evaluateMarketCondition = (marketData) => {
    const marketCount = marketData.length;
    let marketCondition = 0;
    let marketAverage = 'neutral';

    marketData.forEach((value) => {
        switch (value.technical_rating) {
            case 'Very Bullish':
                marketCondition += 2;
                break;
            case 'Bullish':
                marketCondition += 1;
                break;
            case 'Very Bearish':
                marketCondition -= 2;
                break;
            case 'Bearish':
                marketCondition -= 1;
                break;
            default:
                marketCondition += 0;
        }
    })

    if (marketCondition < 6) {
        marketAverage = 'bullish'
    } else if (marketCondition > 10) {
        marketAverage = 'bearish'
    }

    console.log(marketCondition, marketCount, marketAverage);
    return {marketCondition, marketCount, marketAverage};
}

main();