import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { appConfig } from '../../config/app';

// login
export const login = async (): Promise<string> => {
    const body = {
        userId: appConfig.userId,
        pwd: appConfig.pwd,
        factor2: appConfig.login2fa,
        vc: appConfig.vc,
        imei: appConfig.imei,
        apiKey: appConfig.apiKey,
    };

    const headers = {
        'x-api-key': appConfig.proxyApiKey,
    };

    const response =  await axios.post(apiPath.login, body, { headers });

    return response.data.susertoken;
}
