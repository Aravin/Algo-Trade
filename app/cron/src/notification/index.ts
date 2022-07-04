import { SNSClient, PublishCommandInput, PublishCommand } from "@aws-sdk/client-sns";
import { appConfig } from "../config";

export const ssnClient = (() => {
    let instance: SNSClient;

    const createInstance = () => {
        if (!instance) {
            instance = new SNSClient({ region: "ap-south-1" });
        }
        return instance;
    }

    return {
        getInstance: () => createInstance(),
        postMessage: async (message: string) => {
            const local = createInstance();
            const params: PublishCommandInput = {
                Message: message,
                TopicArn: appConfig.aws.sns.topic,
            };

            try {
                await local.send(new PublishCommand(params));

            } catch (err: unknown) {
                console.error((err as Error).message);
            }
        },
    }
})();
