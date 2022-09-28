const axios = require('axios');
const getChecksum = require('./checksum');
const sessionKey = require('./session');

module.exports = processRequest = async (path, body) => {

    const date = new Date().toISOString().split(".")[0] + '.000Z';

    const config = {
        method: 'get',
        url: `https://api.icicidirect.com/breezeapi/api/v1/${path}`,
        headers: {
            'Content-Type': 'application/json', 
            'X-Checksum': `token ${getChecksum(body, date)}`,
            'X-Timestamp': date,
            'X-AppKey': process.env.BREEZE_API_KEY,
            'X-SessionToken': sessionKey,
        },
        data: JSON.stringify(body),
    };

    return axios(config);
}
