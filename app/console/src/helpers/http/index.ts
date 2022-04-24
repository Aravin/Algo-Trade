import { accountLimit } from "./accountLimit";
import { login } from "./login";
import { orderList } from "./orderList";
import { orderPositions } from "./orderPositions";
import { placeOrder } from "./placeOrder";
import { scriptQuote } from "./scriptQuote";
import { scriptSearch } from "./scriptSearch";

export const api = {
    login: login,
    placeOrder: placeOrder,
    accountLimit: accountLimit,
    scriptQuote: scriptQuote,
    scriptSearch: scriptSearch,
    orderList: orderList,
    orderPositions: orderPositions,
}