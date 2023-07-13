// https://www.finvasia.com/api-documentation#api-logout
import { apiPath } from '../../config/apiPath';
import { config } from '../../config/config';
import { appConfig } from '../../../../config/app';
import { axiosRequest } from '../../../../utils/http/axios';

export const scriptSearch = async (scriptText: string) => {

    const request = {
        uid: appConfig.userId,
        stext: scriptText,
        exch: 'NFO',
    };

    const jData = 'jData=' + JSON.stringify(request);
    const jKey = '&jKey=' + appConfig.token;

    const response =  await axiosRequest.post(config.basePath + apiPath.searchScript, jData + jKey);
    return response.data;
};

// scriptSearch('NIFTY 06JUL23 19500 CE');
