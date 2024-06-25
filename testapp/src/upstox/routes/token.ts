import axios, { AxiosRequestConfig } from "axios";
import { Request, Response, NextFunction } from 'express';
import qs from 'qs';
import { appConfig } from "../config";
import { eventEmitter } from "../event";

export const token = async (req: Request, res: Response) => {

    console.log('Token API invoked...');

    try {
        const config: AxiosRequestConfig = {
            method: 'POST',
            url: `${appConfig.baseUrl}/login/authorization/token`,
            data: qs.stringify({
                code: req.app.locals.code, // 9CsW-6
                client_id: appConfig.clientId,
                client_secret: appConfig.clientSecret,
                redirect_uri: appConfig.callbackUrl,
                grant_type: 'authorization_code'
            }),
        };

        const response = await axios(config);
        const responseData = response.data;

        res.locals.access_token = responseData.access_token;
        res.locals.extended_token = responseData.extended_token;
        eventEmitter.emit('service_start', responseData.access_token);

        return res.send(responseData);
    } catch (error: unknown) {
        res.send((error as any).response.data);
    }
}

