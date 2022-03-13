const axios = require("axios");
const cheerio = require('cheerio')

exports.handler = async (event) => {
    
    const columns = ['name', 'last', 'change', 'changePercent', 'open', 'high', 'low', 'prevClose', 'last5DayPerf'];
    const info = [];
    const requiredMarkets = ['Nasdaq', 'FTSE', 'CAC', 'DAX', 'SGX Nifty', 'Nikkei 225', 'Hang Seng', 'KOSPI'];

    const website = 'https://www.moneycontrol.com/markets/global-indices/';
    const data = await axios.get(website);
    const $ = cheerio.load(data.data, null, false);

    $('.glob_indi_lft table tbody tr').each((i, tr) => {
        const obj = {};
        $('td', tr).each((j, td) => {
            if (j === 0) {
                obj[columns[j]] = $(td).text().replace(/\((.*?)\)/g, '').trim();
            } else {
                obj[columns[j]] = parseFloat($(td).text().split('\n').join('').split(' ')[0].trim());
            }
        })

        info.push(obj);
    });
    
    const response = {
        statusCode: 200,
        body: JSON.stringify(info),
    };
    return response;
};
