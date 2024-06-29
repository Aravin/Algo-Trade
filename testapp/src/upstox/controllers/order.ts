import axios, { AxiosError, AxiosRequestConfig } from "axios";
import qs from "qs";
import { appConfig } from "../config";
import { getOtmDetails } from "../lib/calculations/get-otm-details";
import { optionsChainMockResponse } from "../mocks/option-chain.mock";

export const placeOrder = async (token: string, instrument_token: string, order_type: 'BUY' | 'SELL' = 'BUY'): Promise<string> => {

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
                transaction_type: order_type,
                disclosed_quantity: 0,
                trigger_price: 0,
                is_amo: false,
            }
        };

        const orderResponse = await axios(config);
        const orderResponseData = orderResponse.data;

        return orderResponseData?.data?.order_id as string;

    } catch (err: unknown) {
        console.error((err as AxiosError)?.response?.data);
        throw err;
    }
}

// console.debug(getOtmDetails(optionsChainMockResponse.data));
// placeBuyOrder(appConfig.accessToken, getOtmDetails(optionsChainMockResponse.data).call_options.instrument_key);