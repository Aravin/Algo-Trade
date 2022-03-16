const playwright = require('playwright'); 

const MARKET_SENTIMENT_INVESTING_URL = 'https://in.investing.com/indices/s-p-cnx-nifty-technical';
console.time('load time');
console.timeLog('load time');
 
(async () => { 
	// 'webkit' is also supported, but there is a problem on Linux 
	for (const browserType of ['chromium']) { 
		const browser = await playwright[browserType].launch(); 
        console.timeLog('load time');
		const context = await browser.newContext(); 
		const page = await context.newPage(); 
		await page.goto(MARKET_SENTIMENT_INVESTING_URL); 
        console.timeLog('load time');
		console.log(await page.locator('.summary').textContent()); 
		await browser.close(); 
	} 
})();