const Api = require("./lib/RestApi");

let { authparams } = require("./cred");

const api = new Api({});

api.login(authparams)
    .then((res) => {

        console.log(res?.data);

        // limits
        // api.get_limits()
        //     .then(data => console.log(data))
        //     .catch(err => console.log(err.message))

        // history data
        api.get_time_price_series('NFO', 'token', '1664202280', '1664288680', '5')
            .then(data => console.log(data))
            .catch(err => console.log(err.message))

    }).catch((err) => {
        console.error(err.message);
    });


    // failure day

    // {
    //     request_time: '23:12:28 11-04-2022',
    //     stat: 'Ok',
    //     prfname: 'SHOONYA',
    //     cash: '792.12',
    //     payin: '0.00',
    //     payout: '0.00',
    //     brkcollamt: '0.00',
    //     unclearedcash: '0.00',
    //     aux_daycash: '0.00',
    //     aux_brkcollamt: '0.00',
    //     aux_unclearedcash: '0.00',
    //     daycash: '0.00',
    //     turnoverlmt: '999999999999.00',
    //     pendordvallmt: '999999999999.00',
    //     turnover: '6923520.00',
    //     marginused: '80.00',
    //     peak_mar: '530.00',
    //     margincurper: '10.10',
    //     premium: '80.00',
    //     premium_d_m: '80.00'
    //   }

    // successful data

    // {
    //     request_time: '15:17:09 12-04-2022',
    //     stat: 'Ok',
    //     prfname: 'SHOONYA',
    //     cash: '708.91',
    //     payin: '0.00',
    //     payout: '0.00',
    //     brkcollamt: '0.00',
    //     unclearedcash: '0.00',
    //     aux_daycash: '0.00',
    //     aux_brkcollamt: '0.00',
    //     aux_unclearedcash: '0.00',
    //     daycash: '0.00',
    //     turnoverlmt: '999999999999.00',
    //     pendordvallmt: '999999999999.00',
    //     turnover: '5171975.00',
    //     peak_mar: '497.50',
    //     premium: '-20.00',
    //     premium_d_m: '-20.00'
    //   }
      