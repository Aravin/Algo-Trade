const express = require('express')
var bodyParser = require('body-parser');
const axios = require('axios');
const dotenv = require('dotenv');
const BASE_URL = 'https://api-v2.upstox.com';
let isLogged = false;
let accessToken = null;

dotenv.config();
const app = express()
const port = 3000

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Ok');
})

app.get('/redirect', async (req, res) => {
  console.log(req.body);
  console.log(req.query);
  const code = req.query.code || 'xyz';

  if (!isLogged) {
    const response = await axios.post(
        `${BASE_URL}/login/authorization/token`,
        `code=${code}&client_id=${process.env.UPSTOX_CLIENT_ID}&client_secret=${process.env.UPSTOX_CLIENT_SECRRET}&redirect_uri=http://localhost:3000/redirect&grant_type=authorization_code`,
        {
            headers: {
                'Api-Version': '2.0'
            }
        }
    )

    console.log(response.data);
    accessToken = response.data.access_token;

    isLogged = true;
  }
  res.send('ok')
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)

  console.log(`Login using ${BASE_URL}/login/authorization/dialog?response_type=code&client_id=${process.env.UPSTOX_CLIENT_ID}&redirect_uri=http://localhost:3000/redirect`);
})


// market quote
