// https://www.finvasia.com/api-documentation#api-logout
import axios, { AxiosError } from 'axios';
import { apiPath } from '../../config/apiPath';
import { config } from '../../config/config';
import { appConfig } from '../../../../config/app';

export const accountLimit = async () => {

    const request = {
        uid: appConfig.userId,
        token: appConfig.token,
        actid: appConfig.userId,
        prd: null,
        seg: null,
        exch: null,
    };

    const jData = 'jData=' + JSON.stringify(request);
    const jKey = '&jKey=' + appConfig.token;

    const response =  await axios.post(config.basePath + apiPath.accountLimit, jData + jKey);
    return response.data;
};
