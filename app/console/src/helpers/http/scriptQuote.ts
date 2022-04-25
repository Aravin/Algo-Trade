import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { appConfig } from '../../config/app';
import { Account } from '../../models/account';

export const scriptQuote = async (exch: string, symbol: string): Promise<any> => {
    const body = {
        userId: appConfig.userId,
        userToken: Account.getInstance().token,
        token: symbol,
        exch: exch,
    };

    const headers = {
        'x-api-key': appConfig.proxyApiKey,
    };

    const response =  await axios.post(apiPath.scriptQuote, body, { headers });

    return response.data;
}
