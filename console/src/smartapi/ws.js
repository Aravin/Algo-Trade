const WebSocket = require("ws");

let jwtToken =
  "Bearer <replace bearer here>";
let clientCode = "";
let apiKey = "";

let url =
  "wss://omnefeeds.angelbroking.com/NestHtml5Mobile/socket/stream?jwttoken=" +
  jwtToken +
  "&clientcode=" +
  clientCode +
  "&apikey=" +
  apiKey;

let strwatchlistscrips = "nse_cm|2885&nse_cm|1594&nse_cm|11536";

let req =
  '{"task":"cn","channel":"","token":"' +
  jwtToken +
  '","user": "' +
  clientCode +
  '","acctid":"' +
  clientCode +
  '"}';
var subReq =
  '{"task":"mw","channel":"' +
  strwatchlistscrips +
  '","token":"' +
  jwtToken +
  '","user": "' +
  clientCode +
  '","acctid":"' +
  clientCode +
  '"}';

const ws = new WebSocket(url, { rejectUnauthorized: false });

ws.on("open", () => {
  ws.send(req, (err) => {
    console.log(err);
  });

  ws.send(subReq, (err) => {
    console.log(err);
  });
});

ws.on("message", (ws, data) => {
  console.log({ws, data });
});

ws.on("error", (ws, err) => {
  console.log(err);
});

ws.on("close", (ws, code, reason) => {
  console.log({ code, reason });
});
