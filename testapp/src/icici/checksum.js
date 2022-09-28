var sha256 = require("crypto-js/sha256");

module.exports = getChecksum = (body, date) => {
    const secret = process.env.BREEZE_SECRET_KEY;
    const checksum = sha256(date+JSON.stringify(body)+secret);
    return checksum;
}