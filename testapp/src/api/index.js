const axios = require("axios");
const cheerio = require('cheerio');

const INVESTING_NIFTY_TECH_API = 'https://in.investing.com/instruments/Service/GetTechincalData';

async function getIndiaMarket(duration) {
    try {

        const uniAxios = axios.create();
        const niftyTrend = await uniAxios.post(INVESTING_NIFTY_TECH_API,
            `pairID=17940&period=${duration}&viewType=normal`,
            {
                headers: { 
                    "Content-Type": "application/x-www-form-urlencoded",
                    "x-requested-with": "XMLHttpRequest"
                }
            });

        const $ = cheerio.load(niftyTrend.data, null, false);

        return {
            summary: $('.summary > span').text().toLowerCase(),
            ma: {
                summary: $('#techStudiesInnerWrap > div:nth-child(2) > span:eq(1)').text().toLowerCase(),
                buy: $('#maBuy').text().toLowerCase().replace(/[()]/g, ''),
                sell: $('#maSell').text().toLowerCase().replace(/[()]/g, ''),
            },
            ti: {
                summary: $('#techStudiesInnerWrap > div:nth-child(3) > span:eq(1)').text().toLowerCase(),
                buy: $('#tiBuy').text().toLowerCase().replace(/[()]/g, ''),
                sell: $('#tiSell').text().toLowerCase().replace(/[()]/g, ''),
            },
            trend: {
                atr: {
                    value: $('#curr_table > tbody > tr:nth-child(8) > td.right').text().toLowerCase(),
                    action: $('#curr_table > tbody > tr:nth-child(8) > td.left > span').text().toLowerCase(),
                }
            },
            status: 'success',
        }

    } catch (err) {
        throw new Error(err.message);
    }
}

// getIndiaMarket(60);
// getIndiaMarket(300);

module.exports.getIndiaMarket = getIndiaMarket;
