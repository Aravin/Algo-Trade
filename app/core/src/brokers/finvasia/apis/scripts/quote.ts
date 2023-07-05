// https://www.finvasia.com/api-documentation#api-logout
import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { config } from '../../config/config';
import { appConfig } from '../../../../config/app';

export const scriptQuote = async (exchange: string, token: string) => {

    const request = {
        uid: appConfig.userId,
        token: token,
        exch: exchange,
    };

    const jData = 'jData=' + JSON.stringify(request);
    const jKey = '&jKey=' + appConfig.token;

    const response =  await axios.post(config.basePath + apiPath.scriptQuote, jData + jKey);
    return response.data;
};

// scriptQuote('NFO', '47084');
