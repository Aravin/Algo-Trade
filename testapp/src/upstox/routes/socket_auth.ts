import axios, { AxiosRequestConfig } from "axios";
import { Request, Response } from 'express';
import { appConfig } from "../config";

export const socketAuth = async (req: Request, res: Response) => {

    try {
        let path = '';
        const apiType = req.query.api;
        if (apiType === 'market') {
            path = 'market-data';
        } else if (apiType === 'portfolio') {
            path = 'portfolio-stream';
        } else {
            return res.status(400).send({
                status: 'error',
                message: 'Invalid api type',
            });
        }

        const config: AxiosRequestConfig = {
            method: 'GET',
            url: `${appConfig.baseUrl}/feed/${path}-feed/authorize`,
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

