import dotenv from 'dotenv';

dotenv.config();

export const appConfig = {
    proxyApiPath: process.env.FINVASIA_PROXY_PATH || '',
    proxyApiKey: process.env.FINVASIA_PROXY_APIKEY || '',
    userId: process.env.FINVASIA_USERID || '',
    pwd: process.env.FINVASIA_PWD || '',
    login2fa: process.env.FINVASIA_2FA || '',
    vc: process.env.FINVASIA_VENDOR_CODE || '',
    apiKey: process.env.FINVASIA_API_KEY || '',
    imei: process.env.FINVASIA_IMEI || '',
    token: process.env.FINVASIA_TOKEN || '',
}
