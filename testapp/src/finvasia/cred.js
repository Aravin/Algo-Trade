const dotenv = require('dotenv');
dotenv.config();

module.exports.authparams = {
'userid'   : process.env.FINVASIA_USERID,
'password' : process.env.FINVASIA_PWD,
'twoFA'    : process.env.FINVASIA_2FA,
'vendor_code' : process.env.FINVASIA_VENDOR_CODE,
'api_secret' : process.env.FINVASIA_API_KEY,
'imei'       : process.env.FINVASIA_IMEI,
}