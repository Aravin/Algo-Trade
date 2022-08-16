import axios from "axios";
import dayjs from "dayjs";

const INVESTING_MAJOR_INDICES_API = 'https://api.investing.com/api/financialdata/table/sml/74?fieldmap=indices.technical';

export async function getGlobalMarket() {
    try {
        const globalData = [];
        const requiredMarkets: any = {
            'Dow Jones': 'US',
            'FTSE 100': 'Europe',
            'CAC 40': 'Europe',
            'DAX': 'Europe',
            'Nikkei 225': 'Asia',
            'Hang Seng': 'Asia',
            'Shanghai': 'Asia',
            'KOSPI': 'Asia',
        };
        const marketSentimentRating: any = {
            strong_sell: -2,
            sell: -1,
            neutral: 0,
            buy: 1,
            strong_buy: 2,
        };

        const uniAxios = axios.create();

        // Global data
        const globalResponse = await uniAxios.get(INVESTING_MAJOR_INDICES_API);
        const globalResponseData = globalResponse.data.data;
        const filteredGlobalResponseData = globalResponseData.filter((d: any) => Object.keys(requiredMarkets).includes(d.shortname_translated));

        for (const data of filteredGlobalResponseData) {
            const marketName = data.shortname_translated;
            const sentimentValue = data.data[2];

            const obj = {
                name: marketName,
                sentiment: data.data[2],
                sentimentValue: marketSentimentRating[sentimentValue],
                market: requiredMarkets[marketName],
            };

            globalData.push(obj);
        }

        const currentTimeHHmm = parseInt(dayjs().format('HHmm'));
        const marketToWatch = ['US'];

        if (currentTimeHHmm >= 900 && currentTimeHHmm < 1230) {
            marketToWatch.push('Asia');
        }
        else if (currentTimeHHmm >= 1230 && currentTimeHHmm < 1600) {
            marketToWatch.push('Europe');
            marketToWatch.push('Asia');
        }

        marketToWatch.push('Europe');

        const activeMarket = globalData.filter((v, i) => marketToWatch.includes(v.market));
        const activeMarketSentiment = activeMarket.reduce((acc, obj) => acc + obj.sentimentValue, 0)

        if (activeMarketSentiment > 0) {
            return 'buy';
        }
        else if (activeMarketSentiment < 0) {
            return 'sell';
        }

        return 'neutral';
    }
    catch (err: any) {
        throw new Error(err.message);
    }
}