import axios, { AxiosRequestConfig } from "axios";
import { appConfig } from "../config";
import { optionsChainMockResponse } from "../mocks/option-chain.mock";
import { token } from "../routes";

export const optionChainController = async () => {

  return optionsChainMockResponse.data;

  const optionChainConfig: AxiosRequestConfig = {
    method: 'GET',
    url: `${appConfig.baseUrl}/option/chain?instrument_key=NSE_INDEX|Nifty%2050&expiry_date=2024-06-20`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: `application/json`,
    }
  };

  const optionChainResponse = await axios(optionChainConfig);
  const optionChainData = optionChainResponse.data;

  return optionChainData;
}