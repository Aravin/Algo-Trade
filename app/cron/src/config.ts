import dotenv from 'dotenv';
dotenv.config();

export const appConfig = {
    webhookURL: process.env.WEBHOOK_URL || '',
}
