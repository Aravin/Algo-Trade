import axios from "axios";
import * as cheerio from 'cheerio';
import { getTrend } from "../../../helpers/common/getTrend";

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
                },
                rsi: {
                    value: $('#curr_table > tbody > tr:nth-child(1) > td.right').text().toLowerCase(),
                    action: getTrend($('#curr_table > tbody > tr:nth-child(1) > td.left > span').text()),
                },
                hl: {
                    value: $('#curr_table > tbody > tr:nth-child(9) > td.right').text().toLowerCase(),
                    action: getTrend($('#curr_table > tbody > tr:nth-child(9) > td.left > span').text()),
                },
            },
            status: 'success',
        }

    }
    catch (err: any) {
        throw new Error(err.message);
    }
}
