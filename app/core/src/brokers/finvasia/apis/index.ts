import { accountLimit } from "./account/limit";
import { login } from "./login";
import { orderList } from "./orders/list";
import { orderPositions } from "./orders/position";
import { placeOrder } from "./orders/place";
import { scriptQuote } from "./scripts/quote";
import { scriptSearch } from "./scripts/search";

export const api = {
    login: login,
    placeOrder: placeOrder,
    accountLimit: accountLimit,
    scriptQuote: scriptQuote,
    scriptSearch: scriptSearch,
    orderList: orderList,
    orderPositions: orderPositions,
}