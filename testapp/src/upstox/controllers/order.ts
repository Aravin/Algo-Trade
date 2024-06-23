import axios, { AxiosError, AxiosRequestConfig } from "axios";
import qs from "qs";
import { appConfig } from "../config";
import { getOtmDetails } from "../lib/calculations/get-otm-details";
import { optionsChainMockResponse } from "../mocks/option-chain.mock";

export const placeBuyOrder = async (token: string, instrument_token: string) => {

    try {
        const config: AxiosRequestConfig = {
            method: 'POST',
            url: `${appConfig.baseUrl}/order/place`,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': `application/json`,
                Accept: `application/json`,
            },
            data: {
                quantity: 25,
                product: 'I',
                validity: 'DAY',
                price: 0.0,
                tag: 'algo',
                instrument_token,
                order_type: 'MARKET',
                transaction_type: 'BUY',
                disclosed_quantity: 0,
                trigger_price: 0,
                is_amo: false,
            }
        };

        const orderResponse = await axios(config);
        // const orderResponseData = orderResponse.data;

        // return orderResponseData

    } catch (err: unknown) {
        console.error((err as AxiosError)?.response?.data);
    }
}

// console.debug(getOtmDetails(optionsChainMockResponse.data));
placeBuyOrder(appConfig.accessToken, getOtmDetails(optionsChainMockResponse.data).call_options.instrument_key);