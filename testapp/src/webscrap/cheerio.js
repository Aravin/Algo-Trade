const axios = require("axios");
const cheerio = require('cheerio');

// const symbols = `N225,000001,HSI,KOSPI,GDAXI,AIM1,FCHI,DJI,DXY`;
// const investingSite = `https://in.investing.com/indices/major-indices`;
// const moneyControlSite = `https://www.moneycontrol.com/technical-analysis/indian-indices/nifty-50-9/daily`;

// async function scrapInvestingSite(website) {
//     const data = await axios.get(website);
//     let columns = ['action', 'flag', 'name', 'last', 'high', 'low', 'changePercent', 'change', 'time'];
//     let items = [];

//     const $ = cheerio.load(data.data, null, false);

//     $('.instrument section table tbody tr').each((i, tr) => {
//         const obj = {};
//         $('td', tr).each((j, td) => {
//             obj[columns[j]] = $(td).text().split('\n').join('');
//         })

//         items.push(obj);
//     });

//     return items;
// }

// async function scrapMarketSentiment(website) {
//     let columns = ['type', 'r1', 'r2', 'r3', 'pp', 's1', 's2', 's3'];
//     let pivotPoints = [];

//     const data = await axios.get(website);
//     const $ = cheerio.load(data.data, null, false);

//     const marketSentiment = $('#techratingsumd .bulishbar').text().trim();

//     $('#pevotld .mob-hide table tbody tr').each((i, tr) => {
//         const obj = {};
//         $('td', tr).each((j, td) => {
//             obj[columns[j]] = $(td).text().split('\n').join('');
//         })

//         pivotPoints.push(obj);
//     });

//     console.log({
//         marketSentiment,
//         pivotPoints,
//     })

//     return {
//         marketSentiment,
//         pivotPoints,
//     }
// }

const GLOBAL_MARKET_URL = `https://www.moneycontrol.com/markets/global-indices/`;
const MARKET_SENTIMENT_URL = `https://www.moneycontrol.com/technical-analysis/indian-indices/nifty-50-9/daily`;
const MARKET_SENTIMENT_INVESTING_URL = 'https://in.investing.com/indices/s-p-cnx-nifty-technical'
const INVESTING_MAJOR_INDICES = 'https://in.investing.com/indices/major-indices';
const INVESTING_MAJOR_INDICES_API = 'https://api.investing.com/api/financialdata/table/sml/74?fieldmap=indices.technical';
// TODO: using https://in.investing.com/indices/major-indices

async function scrapGlobalMarket() {
    try {
        const globalColumn = ['name', 'last', 'change', 'changePercent', 'open', 'high', 'low', 'prevClose', 'last5DayPerf'];
        const globalData = [];
        const pivotColumns = ['type', 'r1', 'r2', 'r3', 'pp', 's1', 's2', 's3'];
        const pivotPoints = [];
        const requiredMarkets = ['Nasdaq', 'FTSE', 'CAC', 'DAX', 'SGX Nifty', 'Nikkei 225', 'Hang Seng', 'KOSPI'];

        const uninterceptedAxiosInstance = axios.create();

        // Global data
        const globalResponseData = await uninterceptedAxiosInstance.get(GLOBAL_MARKET_URL);
        const $1 = cheerio.load(globalResponseData.data, null, false);

        $1('.glob_indi_lft table tbody tr').each((i, tr) => {
            const obj = {};
            $1('td', tr).each((j, td) => {
                if (j === 0) {
                    obj[globalColumn[j]] = $1(td).text().replace(/\((.*?)\)/g, '').trim();
                } else {
                    obj[globalColumn[j]] = parseFloat($1(td).text().split('\n').join('').split(' ')[0].trim());
                }
            })

            globalData.push(obj);
        });
        
        const filteredInfo = globalData.filter((v) => requiredMarkets.includes(v.name) );

        // india data
        const marketSentimentData = await uninterceptedAxiosInstance.get(MARKET_SENTIMENT_URL);
        const $ = cheerio.load(marketSentimentData.data, null, false);

        const marketSentiment = $('#techratingsumd .bulishbar').text().trim();

        $('#pevotld .mob-hide table tbody tr').each((i, tr) => {
            const obj = {};
            $('td', tr).each((j, td) => {
                obj[pivotColumns[j]] = $(td).text().split('\n').join('');
            })

            pivotPoints.push(obj);
        });

        return {
            globalData: filteredInfo,
            marketSentiment,
            pivotPoints,
            status: 'success',
        };
    } catch (err) {
        // console.log(err);
        throw new Error(err.message);
    }
}

async function scrapGlobalMarketV2() {
    try {
        const globalColumn = ['name', 'last', 'change', 'changePercent', 'open', 'high', 'low', 'prevClose', 'last5DayPerf'];
        const globalData = [];
        const requiredMarkets = ['Nasdaq', 'FTSE', 'CAC', 'DAX', 'SGX Nifty', 'Nikkei 225', 'Hang Seng', 'KOSPI'];

        const uninterceptedAxiosInstance = axios.create();

        // Global data
        const globalResponseData = await uninterceptedAxiosInstance.get(GLOBAL_MARKET_URL);
        const $1 = cheerio.load(globalResponseData.data, null, false);

        $1('.glob_indi_lft table tbody tr').each((i, tr) => {
            const obj = {};
            $1('td', tr).each((j, td) => {
                if (j === 0) {
                    obj[globalColumn[j]] = $1(td).text().replace(/\((.*?)\)/g, '').trim();
                } else {
                    obj[globalColumn[j]] = parseFloat($1(td).text().split('\n').join('').split(' ')[0].trim());
                }
            })
            globalData.push(obj);
        });
        
        const filteredInfo = globalData.filter((v) => requiredMarkets.includes(v.name) );

        // india data
        const marketSentimentData = await uninterceptedAxiosInstance.get(MARKET_SENTIMENT_INVESTING_URL);
        const $ = cheerio.load(marketSentimentData.data, null, false);

        const marketSentiment = $('.summary > span:nth-child(1)').text().trim().toLowerCase();
        const movingAverage = $('.summaryTableLine:nth-child(2) span:nth-child(2)').text().trim().toLowerCase();
        const technicalIndicator = $('.summaryTableLine:nth-child(3) span:nth-child(2)').text().trim().toLowerCase();

        // console.log({
        //     globalData: filteredInfo,
        //     marketSentiment,
        //     movingAverage,
        //     technicalIndicator,
        //     status: 'success',
        // })

        return {
            globalData: filteredInfo,
            marketSentiment,
            movingAverage,
            technicalIndicator,
            status: 'success',
        };
    } catch (err) {
        // console.log(err);
        throw new Error(err.message);
    }
}

async function scrapGlobalMarketV3() {
    try {
        const globalColumn = ['name', 'last', 'change', 'changePercent', 'open', 'high', 'low', 'prevClose', 'last5DayPerf'];
        const globalData = [];
        const requiredMarkets = ['Nasdaq', 'FTSE', 'CAC', 'DAX', 'SGX Nifty', 'Nikkei 225', 'Hang Seng', 'KOSPI'];
        const asiaMarkets = ['KOSPI', 'Hang Seng', 'Nikkei 225', 'SGX Nifty'];
        const europeMarkets = ['DAX', 'CAC', 'FTSE'];
        const usMarket = ['Nasdaq']

        const uniAxios = axios.create();

        // Global data
        const globalResponseData = await uniAxios.get(GLOBAL_MARKET_URL);
        const $1 = cheerio.load(globalResponseData.data, null, false);

        $1('.glob_indi_lft table tbody tr').each((i, tr) => {
            const obj = {};
            $1('td', tr).each((j, td) => {
                if (j === 0) {
                    obj[globalColumn[j]] = $1(td).text().replace(/\((.*?)\)/g, '').trim();
                } else {
                    obj[globalColumn[j]] = parseFloat($1(td).text().split('\n').join('').split(' ')[0].trim());
                }
            })
            globalData.push(obj);
        });
        
        const filteredInfo = globalData.filter((v) => requiredMarkets.includes(v.name));

        const marketWithRegion = filteredInfo.map((d, v) => { 
            if (asiaMarkets.includes(d.name)) {
                d.market = 'Asia';
            } else if (europeMarkets.includes(d.name)) {
                d.market = 'Europe';
            } else if (usMarket.includes(d.name)) {
                d.market = 'US';
            }
            delete d.last5DayPerf;
            return d;
        })

        return {
            globalData: marketWithRegion,
            status: 'success',
        };
    } catch (err) {
        // console.log(err);
        throw new Error(err.message);
    }
}

 
async function scrapGlobalMarketV4() {
    try {
        const globalData = [];
        const requiredMarkets = {
            'Dow Jones': 'US',
            'FTSE 100': 'Europe',
            'CAC 40': 'Europe',
            'DAX': 'Europe', 
            'Nikkei 225': 'Asia',
            'Hang Seng': 'Asia',
            'Shanghai': 'Asia',
            'KOSPI': 'Asia',
        };
        const marketSentimentRating = {
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
        const filteredGlobalResponseData = globalResponseData.filter((d) => Object.keys(requiredMarkets).includes(d.shortname_translated));

        for (const data of filteredGlobalResponseData) {
            const obj = {
                name: data.shortname_translated,
                sentiment: data.data[2],
                sentimentValue: marketSentimentRating[data.data[2]],
                market: requiredMarkets[data.shortname_translated],
            };

            globalData.push(obj);
        }

        return globalData;
    }
    catch (err) {
        throw new Error(err.message);
    }
}

module.exports.scrapGlobalMarket = scrapGlobalMarketV4;
