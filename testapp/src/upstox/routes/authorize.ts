import { appConfig as config } from "../config";

export const authorize = async () => {
    console.log(`${config.baseUrl}/login/authorization/dialog?response_type=code&client_id=${config.clientId}&redirect_uri=${config.callbackUrl}`);
}

