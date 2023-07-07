// TODO: move to cron project // IMPORTANT //

import axios from "axios";
import { cornData } from "./types";

const MC_PRICEAPI = 'https://priceapi.moneycontrol.com/technicalCompanyData/globalMarket/getGlobalIndicesListingData?view=overview&deviceType=W';
const NIFTYTRADER_NIFTY50 = 'https://webapi.niftytrader.in/webapi/symbol/nifty50-data';
const NIFTYTRADER_PCR = 'https://webapi.niftytrader.in/webapi/option/oi-data?reqType=niftyoilist&reqDate=';
const NIFTYTRADER_MAXPAIN = 'https://webapi.niftytrader.in/webapi/symbol/today-spot-data?symbol=NIFTY+50';

export const cronMarketData = async (): Promise<cornData> => {
    const marketData =
        await Promise.all(
            [
                axios.get(MC_PRICEAPI),
                axios.get(NIFTYTRADER_NIFTY50),
                axios.get(NIFTYTRADER_PCR),
                axios.get(NIFTYTRADER_MAXPAIN),
            ],
        );

    const globalSentimentResponse = marketData[0];
    const globalSentimentData = transformPriceApiData(globalSentimentResponse.data);
    const globalSentiment = evaluateMarketCondition(globalSentimentData);

    const niftySentimentResponse = marketData[1];
    const niftySentiment = evaluateNiftySentiment(niftySentimentResponse.data.resultData);

    const pcrResponse = marketData[2];
    const pcr = analyzePCR(pcrResponse.data.resultData.oiPcrData.pcr);

    const maxPainResponse = marketData[3];
    const maxPain = maxPainResponse.data.resultData.max_pain;

    console.log({g: globalSentiment, n: niftySentiment, pcr, mp: maxPain});

    return { globalSentiment, niftySentiment, pcr, maxPain };
}

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
    let marketCondition = 0;

    for (const value of marketData) {
        let MULTIPLIER = 1;

        if (['CCMP:IND', 'SPX:IND', 'sg;STII', 'tw;IXTA', 'th;SETI', 'id;JSC']
            .includes(value.symbol)
        ) {
            continue;
        }

        if (value.symbol === 'in;gsx') {
            MULTIPLIER = 2;
        }

        switch (value.technical_rating) {
            case 'Very Bullish':
                marketCondition += (2 * MULTIPLIER);
                break;
            case 'Bullish':
                marketCondition += (1 * MULTIPLIER);
                break;
            case 'Very Bearish':
                marketCondition -= (2 * MULTIPLIER);
                break;
            case 'Bearish':
                marketCondition -= (1 * MULTIPLIER);
                break;
            default:
                marketCondition += 0;
        }
    }

    if (marketCondition <= -8) {
        return 'bullish'
    } else if (marketCondition >= 8) {
        return 'bearish'
    } else {
        return 'neutral';
    }
}

const evaluateNiftySentiment = (data: unknown[]) => {
    const adv = data.filter((value) => (value as any).change_per > 0)?.length;

    if (isNaN(adv)) {
        return 'neutral'
    }

    if (adv >= 39) {
        return 'very bullish'
    } else if (adv >= 29) {
        return 'bullish'
    } else if (adv >= 23) {
        return 'neutral'
    } else if (adv >= 13) {
        return 'bearish'
    } else {
        return 'very bearish';
    }
}

const analyzePCR = (pcr: number) => {
    if (pcr > 1 && pcr < 1.6) {
        return 'buy';
    } else if (pcr >= 1.6) {
        return 'overbought';
    } else if (pcr < 1 && pcr > 0.6) {
        return 'sell';
    } else if (pcr <= 0.6) {
        return 'oversold';
    } else {
        return 'neutral';
    }
}
