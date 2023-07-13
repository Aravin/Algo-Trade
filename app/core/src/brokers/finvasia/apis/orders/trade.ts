// https://www.finvasia.com/api-documentation#api-logout
import { apiPath } from '../../config/apiPath';
import { config } from '../../config/config';
import { appConfig } from '../../../../config/app';
import { axiosRequest } from '../../../../utils/http/axios';

export const getTrades = async (body: Record<string, any>) => {

    const request = {
        uid: body.userId,
        token: body.token,
        actid: body.actid,
    };

    const jData = 'jData=' + JSON.stringify(request);
    const jKey = '&jKey=' + appConfig.token;

    const response =  await axiosRequest.post(config.basePath + apiPath.ordersTrade, jData + jKey);
    return response.data;
};
