const puppeteer = require('puppeteer');
const symbols = `N225,000001,HSI,KOSPI,GDAXI,AIM1,FCHI,DJI,DXY`;
const website = `https://in.investing.com/indices/major-indices`;

async function scrapSite(website) {
    // const data = await axios.get(website);

    const browser = await puppeteer.launch({});
    const page = await browser.newPage();

    await page.goto(website);

    const result = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr');

        return Array.from(rows, row => {
            const columns = row.querySelectorAll('td');

            if (columns && columns[2] && !columns[2].innerText.includes('%') && !columns[2].innerText.includes('\n')) {

                return {
                    name: columns[2]?.innerText,
                    last: columns[3]?.innerText,
                    high: columns[4]?.innerText,
                    low: columns[5]?.innerText,
                    changePercent: columns[6]?.innerText,
                    change: columns[7]?.innerText,
                    time: columns[8]?.innerText,
                }
            }
        });
    });

    console.log(result);

    browser.close();

}

const MARKET_SENTIMENT_INVESTING_URL = 'https://in.investing.com/indices/s-p-cnx-nifty-technical'

async function scrapGlobalMarketV2() {
    let browser;
    console.time('load time');
    console.timeLog('load time');

    try {
        browser = await puppeteer.launch({});
        console.timeLog('load time');
        const page = await browser.newPage();
        await page.goto(MARKET_SENTIMENT_INVESTING_URL, {waitUntil: 'load'});
        console.timeLog('load time');
        await page.screenshot({ path: 'example.png' });
        console.timeLog('load time');

    } catch (err) {
        console.log(err);
    } finally {
        await browser.close();
        console.timeLog('load time');
    }
}

scrapGlobalMarketV2();