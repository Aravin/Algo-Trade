// https://www.finvasia.com/api-documentation#api-logout
import axios from 'axios';
import { apiPath } from '../config/apiPath';
import { config } from '../config/config';
import { appConfig } from '../../../config/app';

export const logout = async (body: Record<string, any>) => {

    const loginRequest = {
        uid: body.userId,
    };

    const jData = 'jData=' + JSON.stringify(loginRequest);
    const jKey = '&jKey=' + appConfig.token;

    const response =  await axios.post(config.basePath + apiPath.logout, jData + jKey);
    return response.data;
};
