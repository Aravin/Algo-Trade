import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { appConfig } from '../../config/app';
import { Account } from '../../models/account';

export const scriptSearch = async (search: string): Promise<any> => {
    const body = {
        userId: appConfig.userId,
        userToken: Account.getInstance().token,
        stext: search,
        exch: 'NFO',
    };

    const headers = {
        'x-api-key': appConfig.proxyApiKey,
    };

    const response =  await axios.post(apiPath.accountLimit, body, { headers });

    return response.data;
}
