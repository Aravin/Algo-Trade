import axios, { AxiosRequestConfig } from "axios";
import { Request, Response } from 'express';
import { appConfig } from "../config";

export const socketAuth = async (apiType: string, accessToken: string) => {

    try {
        let path = '';
        if (apiType === 'market') {
            path = 'market-data';
        } else if (apiType === 'portfolio') {
            path = 'portfolio-stream';
        } else {
            return null;
        }

        const config: AxiosRequestConfig = {
            method: 'GET',
            url: `${appConfig.baseUrl}/feed/${path}-feed/authorize`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: `application/json`,
            }
        };

        const response = await axios(config);
        const responseData = response.data;

        // return res.send(responseData);
        return responseData; // not exposed
    } catch (error: unknown) {
        console.log(error);
        // res.send((error as any).response.data);
        return (error as any).response.data || (error as any).message;
    }
}

