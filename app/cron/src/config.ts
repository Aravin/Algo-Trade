import dotenv from 'dotenv';
dotenv.config();

export const appConfig = {
    webhookURL: process.env.WEBHOOK_URL || '',
    // aws services
    aws: {
        sns: {
            topic: process.env.AWS_SNS_TOPIC,
        }
    },
    telegram: {
        botId: process.env.TELEGRAM_BOT_ID,
        chatId: process.env.TELEGRAM_CHAT_ID,
    }
}
