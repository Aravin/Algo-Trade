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

        console.log({
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
            status: 'success',
        })

    } catch (err) {
        // console.log(err);
        throw new Error(err.message);
    }
}

getIndiaMarket(60);
getIndiaMarket(300);

module.exports.scrapGlobalMarket = getIndiaMarket;
