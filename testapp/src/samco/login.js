var sn = require('stocknotejsbridge');

var logindata = {
    body: {
        "userId": "",
        "password": "",
        "yob": ""
    }
};

sn.snapi.userLogin(logindata)
.then((data) => {
    console.log('UserLogin:' + data);
})
.catch((error) => {
    console.log(error)
});
