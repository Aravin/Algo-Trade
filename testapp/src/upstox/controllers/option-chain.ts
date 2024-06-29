import axios, { AxiosRequestConfig } from "axios";
import { appConfig } from "../config";
import { optionsChainMockResponse } from "../mocks/option-chain.mock";
import { getNextWorkingThursday } from "../lib/calculations/next-thursday";

export const optionChainController = async (token: string) => {

  // return optionsChainMockResponse.data;

  const optionChainConfig: AxiosRequestConfig = {
    method: 'GET',
    url: `${appConfig.baseUrl}/option/chain?instrument_key=NSE_INDEX|Nifty%2050&expiry_date=${getNextWorkingThursday()}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: `application/json`,
    }
  };

  const optionChainResponse = await axios(optionChainConfig);
  const optionChainData = optionChainResponse.data?.data;

  return optionChainData;
}