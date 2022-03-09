const url = 'wss://stream.stocknote.com';

let requestBody={
    "streaming_type": "quote",
    "symbols": "[{'symbol':'1270_NSE'}]",
    "request_type": "subscribe",
    "response_format": "JSON"
  }

let requestBody2= {
    "request":{
        "streaming_type":"quote",
        "data":{"symbols": "[{'symbol':'1270_NSE'}]"},
        "request_type":"subscribe",
        "response_format":"json"
    }}

const WebSocket = require('ws');

const ws = new WebSocket(
    url,
    { rejectUnauthorized: false, headers:
        {'x-session-token': 'f3a6b834ed6f7b27a49c2a36a8088398', 'Accept': 'application/json', 'Content-Type': 'application/json'},
    });

ws.on('open', function open() {
  ws.send(JSON.stringify(requestBody));
  ws.send("\n")
});

ws.on('message', function incoming(data) {
  console.log(data);
});

ws.on('close', function incoming(data) {
    console.log(data);
  });

ws.on('error', function incoming(error) {
    console.log(error);
  });