// https://www.finvasia.com/api-documentation#api-logout
import axios from 'axios';
import { apiPath } from '../config/apiPath';
import { config } from '../config/config';
import { Account } from '../../../models/account';

export const logout = async (body: Record<string, any>) => {

    const loginRequest = {
        uid: body.userId,
    };

    const jData = 'jData=' + JSON.stringify(loginRequest);
    const jKey = '&jKey=' + Account.getInstance().token;

    const response =  await axios.post(config.basePath + apiPath.logout, jData + jKey);
    return response.data;
};
