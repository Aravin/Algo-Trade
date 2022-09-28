const express = require('express')
var bodyParser = require('body-parser');
const { default: axios } = require('axios');
const dotenv = require('dotenv');
const sessionKey = require('./session');
const processRequest = require('./axios');

dotenv.config();
const app = express()
const port = 3000

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Ok')
})

app.post('/breeze', (req, res) => {
  console.log(req.body);
  sessionKey = req.query.apisession;
  res.send('ok')
});

app.get('/customerdetails', async (req, res) => {
  const body = {
    SessionToken: sessionKey,
    AppKey: process.env.BREEZE_API_KEY,
  }
  try {
    const response = await processRequest('/customerdetails', body);
    console.log(response);
    res.send(response.data);
  }
  catch(err) {
    console.log(err);
    res.status(500).send(err.message);
  }
})

app.get('/funds', async (req, res) => {
  try {
    const response = await processRequest('/funds', {});
    console.log(response);
    res.send(response.data);
  }
  catch(err) {
    console.log(err);
    res.status(500).send(err.message);
  }
})

app.get('/historicalcharts', async (req, res) => {
  try {
    const response = await processRequest('historicalcharts', req.body);
    res.send(response.data);
  }
  catch(err) {
    console.log(err);
    res.status(500).send(err.message);
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)

  console.log(`Login using https://api.icicidirect.com/apiuser/login?api_key=${process.env.BREEZE_API_KEY}`);
})
