import dotenv from 'dotenv';

dotenv.config();

export const appConfig = {
    baseUrl: process.env.UPSTOX_BASE_URL + '',
    clientId: process.env.UPSTOX_CLIENT_ID + '',
    clientSecret: process.env.UPSTOX_CLIENT_SECRRET + '',
    callbackUrl: process.env.UPSTOX_CALLBACK_URL + '',
}