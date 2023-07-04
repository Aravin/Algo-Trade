// https://www.finvasia.com/api-documentation#api-logout
import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { config } from '../../config/config';
import { Account } from '../../../../models/account';

export const getTrades = async (body: Record<string, any>) => {

    const request = {
        uid: body.userId,
        token: body.token,
        actid: body.actid,
    };

    const jData = 'jData=' + JSON.stringify(request);
    const jKey = '&jKey=' + Account.getInstance().token;

    const response =  await axios.post(config.basePath + apiPath.ordersTrade, jData + jKey);
    return response.data;
};
