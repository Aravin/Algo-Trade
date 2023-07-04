import axios from 'axios';
import { apiPath } from '../../config/apiPath';
import { appConfig } from '../../config/app';
const upstox = appConfig.upstox;

// login
export const login = async (): Promise<string> => {
    const body = `code=${upstox.code}&client_id=${upstox.apiKey}&client_secret=${upstox.secret}&redirect_uri=http://localhost:3000/redirect&grant_type=authorization_code`;

    const headers = {
        'Api-Version': '2.0'
    };

    const response = await axios.post(
        `${apiPath.upstox.login}`,
        body,
        {
            headers,
        });

    return response.data.access_token;
}
