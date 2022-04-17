const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const ddbClient = (() => {
  let instance;

  const createInstance = () => {
    if (!instance) {
      instance = new DynamoDBClient({ region: "ap-south-1" });
    }
    return instance;
  }

  return {
    getInstance: () =>  createInstance(),
    insert: (data) => {
      const local = createInstance();
      const params = {
        TableName: "algo_trade_sentiment",
        Item: {
          date_time: { S: new Date().getTime() },
          data: { S: data },
        },
      };
      return local.send(new PutItemCommand(params));
    }
  }
})();

// const i1 = ddbClient.getInstance();
// ddbClient.insert('hello');

module.exports = ddbClient;
