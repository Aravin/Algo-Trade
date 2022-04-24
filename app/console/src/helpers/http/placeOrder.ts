import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { appConfig } from '../../config/app';
import { Account } from '../../models/account';

// login
export const placeOrder = async (transType: string, symbol: string, qty: number): Promise<string> => {
    const body = {
        userId: appConfig.userId,
        userToken: Account.getInstance().token,
        actid: appConfig.userId,
        exch: 'nfo',
        tsym: symbol,
        qty: qty,
        prc: '',
        trgprc: '',
        prd: 'M',
        transType: transType,
        prctyp: 'M',
        ret: 'DAY',
    };

    const headers = {
        'x-api-key': appConfig.proxyApiKey,
    };

    const response =  await axios.post(apiPath.orderPlace, body, { headers });

    return response.data.norenordno;
}
