import { appConfig } from "./app";

export const apiPath = {
    login: `${appConfig.proxyApiPath}/login`,
    logout: `${appConfig.proxyApiPath}/logout`,
    scriptSearch: `${appConfig.proxyApiPath}/scripts/search`,
    scriptInfo: `${appConfig.proxyApiPath}/scripts/info`,
    scriptQuote: `${appConfig.proxyApiPath}/scripts/quote`,
    accountLimit: `${appConfig.proxyApiPath}/account/limit`,
    orderList: `${appConfig.proxyApiPath}/orders/list`,
    orderPositions: `${appConfig.proxyApiPath}/orders/position`,
    orderTrades: `${appConfig.proxyApiPath}/orders/trade`,
    orderPlace: `${appConfig.proxyApiPath}/orders/place`,
    upstox: {
        login: `${appConfig.upstox.baseURL}/login/authorization/token`,
        scriptSearch: `${appConfig.proxyApiPath}/market-quote/quotes`,
        scriptQuote: `${appConfig.proxyApiPath}/scripts/quote`,
        accountLimit: `${appConfig.upstox.baseURL}/login/authorization/token`,
        orderList: `${appConfig.proxyApiPath}/orders/list`,
        orderPositions: `${appConfig.proxyApiPath}/orders/position`,
        orderPlace: `${appConfig.proxyApiPath}/orders/place`,
    }
}
