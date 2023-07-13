// https://www.finvasia.com/api-documentation#api-logout
import { apiPath } from '../../config/apiPath';
import { config } from '../../config/config';
import { appConfig } from '../../../../config/app';
import { axiosRequest } from '../../../../utils/http/axios';

export const orderList = async () => {

    const request = {
        uid: appConfig.userId,
        token: appConfig.token,
        prd: null,
    };

    const jData = 'jData=' + JSON.stringify(request);
    const jKey = '&jKey=' + appConfig.token;

    const response =  await axiosRequest.post(config.basePath + apiPath.ordersList, jData + jKey);
    return response.data;
};
