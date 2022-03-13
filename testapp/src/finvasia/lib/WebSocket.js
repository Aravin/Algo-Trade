let web_socket = require("ws");

let triggers = {
     "open": [],
     "quote": [],
     "order" : []

};

let { API } = require("./config");


let WebSocketClient = function (cred, params) {
     let self = this;

     let ws = null,
          apikey = cred.apikey;
          
     let url = cred.url;   

     let timeout = API.heartbeat || 3000;   

     this.connect = function (params, callbacks) {
          return new Promise((resolve, reject) => {
               if (apikey === null || url === null ) return "apikey or url is missing";
               console.log(url);

               //callbacks to the app are set here
               this.set_callbacks(callbacks);

               ws = new web_socket(url, null, { rejectUnauthorized: false });

               ws.onopen = function onOpen(evt) {
                    setInterval(function () {
                         var _hb_req = '{"t":"h"}';
                         ws.send(_hb_req);
                    }, timeout);

                    //prepare the data
                    let values              = { "t": "c" };
                    values["uid"]       = params.uid;
                    values["actid"]     = params.actid;
                    values["susertoken"] = params.apikey;
                    values["source"]    = "API";  
                    console.log(JSON.stringify(values));  
                    ws.send(JSON.stringify(values));            
                    resolve()

               };
               ws.onmessage = function (evt) {
                    
                    var result = JSON.parse(evt.data);     
                    console.log(result);

                    if(result.t == 'ck')
                    {
                         trigger("open", [result]);
                    }
                    if( result.t == 'tk' || result.t == 'tf')
                    {
                         trigger("quote", [result]);
                    }
                    if( result.t == 'dk' || result.t == 'df')
                    {
                         trigger("quote", [result]);
                    }
                    if(result.t == 'om')
                    {
                         trigger("order", [result]);
                    }
                    
               };
               ws.onerror = function (evt) {
                    console.log("error::", evt)
                    trigger("error", [JSON.stringify(evt.data)]);
                    self.connect();
                    reject(evt)
               };
               ws.onclose = function (evt) {
                    console.log("Socket closed")
                    trigger("close", [JSON.stringify(evt.data)]);
               };
          })
     }
     this.set_callbacks = function (callbacks) {
          if(callbacks.socket_open !== undefined)
          { 
              this.on('open', callbacks.socket_open);              
          }
          if(callbacks.socket_close !== undefined)
          { 
              this.on('close', callbacks.socket_close);              
          }
          if(callbacks.socket_error !== undefined)
          { 
              this.on('error', callbacks.socket_error);              
          }
          if(callbacks.quote !== undefined)
          {
               this.on('quote', callbacks.quote);               
          }
          if(callbacks.order !== undefined)
          {
               this.on('order', callbacks.order);              
          }
     }
     this.send = function (data) {         
          ws.send(data);                  
     };

     this.on = function (e, callback) {
          if (triggers.hasOwnProperty(e)) {
               triggers[e].push(callback);
          }
     };


     this.close = function () {
          ws.close()
     }
}


// trigger event callbacks
function trigger(e, args) {
     if (!triggers[e]) return
     for (var n = 0; n < triggers[e].length; n++) {
          triggers[e][n].apply(triggers[e][n], args ? args : []);
     }
}

module.exports = WebSocketClient;