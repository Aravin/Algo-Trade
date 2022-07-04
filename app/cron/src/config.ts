import dotenv from 'dotenv';
dotenv.config();

export const appConfig = {
    webhookURL: process.env.WEBHOOK_URL || '',
    // aws services
    aws: {
        sns: {
            topic: process.env.AWS_SNS_TOPIC,
        }
    }
}
