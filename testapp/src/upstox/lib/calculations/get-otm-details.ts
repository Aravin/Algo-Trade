import { optionsChainMockResponse } from "../../mocks/option-chain.mock";
import { OptionData } from './../types/option.types';

export const getOtmDetails = (optionChainData: OptionData[]) => {
    
    const spotPrice = optionChainData[0].underlying_spot_price;

    const otmCallOptions = optionChainData.filter(option => {
        return option.strike_price > spotPrice && // Call option condition
            option.call_options.market_data.ltp > 0; // Option has a valid price
    });

    return otmCallOptions[3]; // skip 2 legs for better price
}

console.debug(getOtmDetails(optionsChainMockResponse.data));