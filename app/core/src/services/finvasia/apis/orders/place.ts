import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { config } from '../../config/config';
import { Account } from '../../../../models/account';
import { appConfig } from '../../../../config/app';

export const placeOrder = async (transType: string, symbol: string, qty: number) => {

    const request = {
        uid: appConfig.userId,
        token: Account.getInstance().token,
        actid: appConfig.userId,
        exch: 'NFO',
        tsym: symbol,
        qty: qty + '',
        prc: '',
        trgprc: '',
        dscqty: 0,
        prd: 'M',
        exchange: null,
        trantype: transType,
        prctyp: 'MKT',
        ret: 'DAY',
    };

    const jData = 'jData=' + JSON.stringify(request);
    const jKey = '&jKey=' + Account.getInstance().token;

    const response =  await axios.post(config.basePath + apiPath.orderPlace, jData + jKey);
    return response.data;
};
