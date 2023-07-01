// TODO: move to cron project // IMPORTANT //

import axios from "axios";

const MC_PRICEAPI = 'https://priceapi.moneycontrol.com/technicalCompanyData/globalMarket/getGlobalIndicesListingData?view=overview&deviceType=W';
const NIFTYTRADER_NIFTY50 = 'https://webapi.niftytrader.in/webapi/symbol/nifty50-data';
const NIFTYTRADER_PCR = 'https://webapi.niftytrader.in/webapi/option/oi-data?reqType=niftyoilist&reqDate=';

export const cronMarketData = async () => {
    const marketData =
        await Promise.all(
            [
                axios.get(MC_PRICEAPI),
                axios.get(NIFTYTRADER_NIFTY50),
                axios.get(NIFTYTRADER_PCR),
            ],
        );

    const globalSentimentResponse = marketData[0];
    const globalSentimentData = transformPriceApiData(globalSentimentResponse.data)
    const globalSentiment = evaluateMarketCondition(globalSentimentData);

    const niftySentimentResponse = marketData[1];
    const niftySentiment = evaluateNiftySentiment(niftySentimentResponse.data.resultData);

    const pcrResponse = marketData[2];
    const pcr = analyzePCR(pcrResponse.data.resultData.oiPcrData.pcr);

    console.log({globalSentiment, niftySentiment, pcr});
}

cronMarketData();


const transformPriceApiData = (apiData: any) => {
    const header = apiData.header;
    const result: any[] = [];

    apiData.dataList.forEach((data: any) => {
        if (data.data) {
            data.data.forEach((eachData: any) => {
                const eachMarket: any = {
                    region: data.heading,
                };
                eachData.forEach((val: any, k: number) => {
                    eachMarket[header[k].name] = val;
                });

                result.push(eachMarket);
            })
        }

    });

    return result;
}

const evaluateMarketCondition = (marketData: any) => {
    const marketCount = marketData.length;
    let marketCondition = 0;
    let marketAverage = 'neutral';

    marketData.forEach((value: any) => {
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

    return marketAverage;
}

const evaluateNiftySentiment = (data: unknown[]) => {
    let sentiment = 'very bearish';
    const adv = data.filter((value) => (value as any).change_per > 0)?.length;

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

const analyzePCR = (pcr: number) => {
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