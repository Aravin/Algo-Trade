import axios, { AxiosRequestConfig } from "axios";
import { Request, Response, NextFunction } from 'express';
import { appConfig } from "../config";

export const quote = async (req: Request, res: Response) => {

    try {
        const config: AxiosRequestConfig = {
            method: 'GET',
            url: `${appConfig.baseUrl}/market-quote/quotes?instrument_key=NSE_INDEX|Nifty%2050&interval=I30`,
            headers: {
                Authorization: `Bearer ${req.app.locals.access_token}`,
                Accept: `application/json`,
            }
        };

        const response = await axios(config);
        const responseData = response.data;

        return res.send(responseData);
    } catch (error: unknown) {
        console.log(error);
        res.send((error as any).response.data);
    }
}

