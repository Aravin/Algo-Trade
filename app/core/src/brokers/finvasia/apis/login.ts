// official doc: https://www.finvasia.com/api-documentation#api-login
import { createHash } from 'crypto';
import { apiPath } from '../config/apiPath';
import { config } from '../config/config';
import { appConfig } from '../../../config/app';
import { axiosRequest } from '../../../utils/http/axios';

export const login = async (authCode: string) => {

    const pwdHash = createHash('sha256').update(appConfig.pwd as string).digest('hex');
    const appKeyHash = createHash('sha256').update(`${appConfig.userId}|${appConfig.apiKey}`).digest('hex');

    const loginRequest = {
        apkversion: config.apkVersion,
        uid: appConfig.userId,
        pwd: pwdHash,
        factor2: authCode,
        vc: appConfig.vc,
        imei: appConfig.imei,
        source: config.source,
        appkey: appKeyHash,
    };

    const jData = 'jData=' + JSON.stringify(loginRequest);

    const response =  await axiosRequest.post(config.basePath + apiPath.login, jData);
    return response.data;
};
