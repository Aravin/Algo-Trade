// official doc: https://www.finvasia.com/api-documentation#api-login
import axios from 'axios';
import { createHash } from 'crypto';
import { apiPath } from '../config/apiPath';
import { config } from '../config/config';
import { appConfig } from '../../../config/app';

export const login = async () => {

    const pwdHash = createHash('sha256').update(appConfig.pwd as string).digest('hex');
    const appKeyHash = createHash('sha256').update(`${appConfig.userId}|${appConfig.apiKey}`).digest('hex');

    const loginRequest = {
        apkversion: config.apkVersion,
        uid: appConfig.userId,
        pwd: pwdHash,
        factor2: appConfig.login2fa,
        vc: appConfig.vc,
        imei: appConfig.imei,
        source: config.source,
        appkey: appKeyHash,
    };

    const jData = 'jData=' + JSON.stringify(loginRequest);

    const response =  await axios.post(config.basePath + apiPath.login, jData);
    return response.data.susertoken;
};
