import axios from "axios";
import * as cheerio from 'cheerio';

const INVESTING_NIFTY_TECH_API = 'https://in.investing.com/instruments/Service/GetTechincalData';
// TODO: use new API https://in.investing.com/indices/s-p-cnx-nifty-technical?timeFrame=60

export async function scrapIndiaMarket(duration: number) {
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
            momentum: {
                rsi: {
                    value: $('#curr_table > tbody > tr:nth-child(1) > td.right').text().toLowerCase(),
                    action: $('#curr_table > tbody > tr:nth-child(1) > td.left > span').text().toLowerCase(),
                },
            },
            trend: {
                macd: {
                    value: $('#curr_table > tbody > tr:nth-child(5) > td.right').text().toLowerCase(),
                    action: $('#curr_table > tbody > tr:nth-child(5) > td.left > span').text().toLowerCase(),
                },
            },
            volatility: {
                atr: {
                    value: $('#curr_table > tbody > tr:nth-child(8) > td.right').text().toLowerCase(),
                    action: $('#curr_table > tbody > tr:nth-child(8) > td.left > span').text().toLowerCase(),
                },
            },
            status: 'success',
        }

    }
    catch (err: unknown) {
        const e = err as Error;
        throw new Error(`${e.message} - ${e.stack}`);
    }
}
