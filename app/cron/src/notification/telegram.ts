import axios from "axios";
import { appConfig } from '../config';

const TELEGRAM_URL = 'https://api.telegram.org';
const TELEGRAM_BOT_ID = appConfig.telegram.botId;
const TELEGRAM_CHAT_ID = appConfig.telegram.chatId;

export const sendNotification = (message: string) => {

    const requestURL = `${TELEGRAM_URL}/bot${TELEGRAM_BOT_ID}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${message}`;

    axios.get(requestURL);
}
