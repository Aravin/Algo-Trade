// https://www.finvasia.com/api-documentation#api-logout
import { apiPath } from '../config/apiPath';
import { config } from '../config/config';
import { appConfig } from '../../../config/app';
import { axiosRequest } from '../../../utils/http/axios';

export const logout = async (body: Record<string, any>) => {

    const loginRequest = {
        uid: body.userId,
    };

    const jData = 'jData=' + JSON.stringify(loginRequest);
    const jKey = '&jKey=' + appConfig.token;

    const response =  await axiosRequest.post(config.basePath + apiPath.logout, jData + jKey);
    return response.data;
};
