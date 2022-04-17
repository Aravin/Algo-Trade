const { CloudWatchLogsClient, PutLogEventsCommand } = require("@aws-sdk/client-cloudwatch-logs");

const cwClient = (() => {
  let instance;
  let sequenceToken = null;

  const createInstance = () => {
    if (!instance) {
      instance = new CloudWatchLogsClient({ region: "ap-south-1" });
    }
    return instance;
  }

  return {
    getInstance: () => createInstance(),
    sendLog: async function (logLevel, data) {
      console.log(sequenceToken);
      const input = {
        logEvents: [{
          message: JSON.stringify({ logLevel: logLevel, api: 'algo trade cron', data: data }),
          timestamp: new Date().getTime() /// 1000,
        }],
        logGroupName: 'algo-trade',
        logStreamName: 'cron-service',
        sequenceToken: sequenceToken || '49628475934467179871652801827664887097331862304242795394',
      };
      const command = new PutLogEventsCommand(input);
      const client = createInstance();
      const response = await client.send(command);
      console.log(response.nextSequenceToken);
      sequenceToken = response.nextSequenceToken;
      console.log(sequenceToken);

      return response;
    }
  }
})();

(async () => {
  try {
    const response = await cwClient.sendLog('error', 'hi');
    const response2 = await cwClient.sendLog('error', 'hi');
    console.log(response);
    console.log(response2);
  } catch (err) {
    console.log("Error", err);
  }
})();

module.exports = cwClient;
