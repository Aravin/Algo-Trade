// https://www.finvasia.com/api-documentation#api-logout
import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { config } from '../../config/config';
import { Account } from '../../../../models/account';
import { appConfig } from '../../../../config/app';

export const scriptSearch = async (scriptText: string) => {

    const request = {
        uid: appConfig.userId,
        stext: scriptText,
        exch: 'NFO',
    };

    const jData = 'jData=' + JSON.stringify(request);
    const jKey = '&jKey=' + Account.getInstance().token;

    const response =  await axios.post(config.basePath + apiPath.searchScript, jData + jKey);
    return response.data;
};
