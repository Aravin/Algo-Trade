const puppeteer = require('puppeteer');
const symbols = `N225,000001,HSI,KOSPI,GDAXI,AIM1,FCHI,DJI,DXY`;
const website = `https://in.investing.com/indices/major-indices`;

async function scrapSite(website) {
    const data = await axios.get(website);

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

scrapSite(website);
