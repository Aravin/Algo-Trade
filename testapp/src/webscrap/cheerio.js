const axios = require("axios");
const cheerio = require('cheerio')

const symbols = `N225,000001,HSI,KOSPI,GDAXI,AIM1,FCHI,DJI,DXY`;
const investingSite = `https://in.investing.com/indices/major-indices`;
const moneyControlSite = `https://www.moneycontrol.com/technical-analysis/indian-indices/nifty-50-9/daily`;

async function scrapInvestingSite(website) {
    const data = await axios.get(website);
    let columns = ['action', 'flag', 'name', 'last', 'high', 'low', 'changePercent', 'change', 'time'];
    let items = [];

    const $ = cheerio.load(data.data, null, false);

    $('.instrument section table tbody tr').each((i, tr) => {
        const obj = {};
        $('td', tr).each((j, td) => {
            obj[columns[j]] = $(td).text().split('\n').join('');
        })

        items.push(obj);
    });

    return items;
}

async function scrapMarketSentiment(website) {
    let columns = ['type', 'r1', 'r2', 'r3', 'pp', 's1', 's2', 's3'];
    let pivotPoints = [];

    const data = await axios.get(website);
    const $ = cheerio.load(data.data, null, false);

    const marketSentiment = $('#techratingsumd .bulishbar').text().trim();

    $('#pevotld .mob-hide table tbody tr').each((i, tr) => {
        const obj = {};
        $('td', tr).each((j, td) => {
            obj[columns[j]] = $(td).text().split('\n').join('');
        })

        pivotPoints.push(obj);
    });

    console.log({
        marketSentiment,
        pivotPoints,
    })

    return {
        marketSentiment,
        pivotPoints,
    }
}

const GLOBAL_MARKET_URL = `https://www.moneycontrol.com/markets/global-indices/`;
const MARKET_SENTIMENT_URL = `https://www.moneycontrol.com/technical-analysis/indian-indices/nifty-50-9/daily`;

async function scrapGlobalMarket() {
    const globalColumn = ['name', 'last', 'change', 'changePercent', 'open', 'high', 'low', 'prevClose', 'last5DayPerf'];
    const globalData = [];
    const pivotColumns = ['type', 'r1', 'r2', 'r3', 'pp', 's1', 's2', 's3'];
    const pivotPoints = [];
    const requiredMarkets = ['Nasdaq', 'FTSE', 'CAC', 'DAX', 'SGX Nifty', 'Nikkei 225', 'Hang Seng', 'KOSPI'];

    // Global data
    const globalResponseData = await axios.get(GLOBAL_MARKET_URL);
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
    console.log(filteredInfo);

    // india data
    const marketSentimentData = await axios.get(MARKET_SENTIMENT_URL);
    const $ = cheerio.load(marketSentimentData.data, null, false);

    const marketSentiment = $('#techratingsumd .bulishbar').text().trim();

    $('#pevotld .mob-hide table tbody tr').each((i, tr) => {
        const obj = {};
        $('td', tr).each((j, td) => {
            obj[pivotColumns[j]] = $(td).text().split('\n').join('');
        })

        pivotPoints.push(obj);
    });

    console.log({
        globalData,
        marketSentiment,
        pivotPoints,
    })
}


// scrapInvestingSite(investingSite);
// console.log(scrapMarketSentiment(moneyControlSite));
scrapGlobalMarket('https://www.moneycontrol.com/markets/global-indices/')