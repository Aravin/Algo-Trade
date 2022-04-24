import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { appConfig } from '../../config/app';
import { Account } from '../../models/account';

export const orderPositions = async (): Promise<any> => {
    const body = {
        userId: appConfig.userId,
        userToken: Account.getInstance().token,
        actid: appConfig.userId,
    };

    const headers = {
        'x-api-key': appConfig.proxyApiKey,
    };

    const response =  await axios.post(apiPath.accountLimit, body, { headers });

    return response.data;
}
