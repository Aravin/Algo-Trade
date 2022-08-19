import axios from "axios";
import * as cheerio from 'cheerio';

const NSE_OPTION_CHAIN_URL = 'https://www.nseindia.com/option-chain';

export async function scrapeOptionChain() {
    try {

        const uniAxios = axios.create();
        const response = await uniAxios.get(NSE_OPTION_CHAIN_URL);
        // console.log(response.data);

        const $ = cheerio.load(response.data, null, true);

        console.log($('#optionChainTable-indices').html());
 
        return {
            status: 'success',
        }

    }
    catch (err: any) {
        throw new Error(err.message);
    }
}


scrapeOptionChain();
