import dotenv from 'dotenv';

dotenv.config();

export const appConfig = {
    // general user settings
    maxLossPerDay: +(process.env.SETTINGS_MAX_LOSS_PER_DAY || 50),
    maxLossPerTrade: +(process.env.SETTINGS_MAX_LOSS_PER_TRADE || 20),
    maxProfitPerDay: +(process.env.SETTINGS_MAX_PROFIT_PER_DAY || 100),
    maxProfitPerTrade: +(process.env.SETTINGS_MAX_PROFIT_PER_TRADE || 40),
    maxTradesPerDay: +(process.env.SETTINGS_MAX_TRADES_PER_DAY || 5),
    maxLossTradesPerDay:
        (+(process.env.SETTINGS_MAX_TRADES_PER_DAY || 5) > +(process.env.SETTINGS_MAX_LOSS_TRADES_PER_DAY || 3))
            ? +(process.env.SETTINGS_MAX_LOSS_TRADES_PER_DAY || 3) : +(process.env.SETTINGS_MAX_TRADES_PER_DAY || 5),
    skipGlobalMarket: process.env.SETTINGS_SKIP_GLOBAL_MARKET === 'true' ? true : false,
    otmPrice: +(process.env.SETTINGS_OTM_PRICE || 200),
    buyStrength: process.env.SETTINGS_BUY_STRENGTH || '',
    // finvasia
    proxyApiPath: process.env.FINVASIA_PROXY_PATH || '',
    proxyApiKey: process.env.FINVASIA_PROXY_APIKEY || '',
    userId: process.env.FINVASIA_USERID || '',
    pwd: process.env.FINVASIA_PWD || '',
    login2fa: process.env.FINVASIA_2FA || '',
    vc: process.env.FINVASIA_VENDOR_CODE || '',
    apiKey: process.env.FINVASIA_API_KEY || '',
    imei: process.env.FINVASIA_IMEI || '',
    token: process.env.FINVASIA_TOKEN || '',
    // aws services
    aws: {
        sns: {
            topic: process.env.AWS_SNS_TOPIC,
        }
    }
}
