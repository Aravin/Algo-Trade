import axios, { AxiosRequestConfig } from "axios";
import { appConfig } from "../config";
import { Candle } from "../lib/types/candle.types";
import { intradayMockResponse } from "../mocks/intraday.mock";

export const intraDayController = async () => {

  return intradayMockResponse.data.candles as Candle[];

  const intraDayConfig: AxiosRequestConfig = {
    method: 'GET',
    url: `${appConfig.baseUrl}/historical-candle/intraday/NSE_INDEX|Nifty%2050/1minute`,
  };

  const intraDayResponse = await axios(intraDayConfig);
  const candles = intraDayResponse.data?.candles;
  // console.log(candles);
  return candles;
}