import axios, { AxiosRequestConfig } from "axios";
import { Request, Response, NextFunction } from 'express';
import qs from 'qs';
import { appConfig } from "../config";

export const history = async (req: Request, res: Response) => {

    try {
        const config: AxiosRequestConfig = {
            method: 'GET',
            url: `${appConfig.baseUrl}/historical-candle/NSE_EQ%7CINE848E01016/30minute/2024-06-10/2024-06-10`,
        };

        const response = await axios(config);
        const responseData = response.data;

        return res.send(responseData);
    } catch (error: unknown) {
        console.log(error);
        res.send((error as any).response.data);
    }
}

