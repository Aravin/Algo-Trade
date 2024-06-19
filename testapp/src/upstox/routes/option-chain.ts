import axios, { AxiosRequestConfig } from "axios";
import { Request, Response, NextFunction } from 'express';
import { appConfig } from "../config";

export const optionChain = async (req: Request, res: Response) => {

    try {
        const config: AxiosRequestConfig = {
            method: 'GET',
            url: `${appConfig.baseUrl}/option/chain?instrument_key=NSE_INDEX|Nifty%2050&expiry_date=2024-06-20`,
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
