import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';

import * as routes from './routes';
import * as middlewares from './middlewares';
import { appConfig } from './config';
import { decodeMarketFeed, initMarketProtoBuf } from './utils/protobuff-decode';
import { eventEmitter } from './event';

dotenv.config();

const app = express();
app.locals.access_token = appConfig.accessToken;
app.locals.code = appConfig.authCode;

app.use(cors());
app.use(bodyParser.json());
app.use(middlewares.errorHandler);

const httpServer = createServer(app);

const wsServer = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, (ws) => {
        wsServer.emit('connection', ws, req);
    });
});

httpServer.listen(3000, async () => {
    console.log('Server is running on port 3000');

    // on app start -> call the auth API
    await routes.authorize();
});


// apis
// 1. Auth
app.get('/callback', async (req: Request, res: Response) => {
    console.log('Callback API invoked...');
    console.log({ body: req.body, params: req.params, query: req.query });

    if (req.query.code) {
        console.log('Auth Success!');
        app.locals.code = req.query.code;
    } else {
        console.log('Auth Failed!');
    }

    res.json({ status: 'Success', message: `call token api` });
});

// 2. Token
app.get('/token', async (req: Request, res: Response) => {
    await routes.token(req, res);
});

// dummmy
app.get('/test', async (req: Request, res: Response) => {
    eventEmitter.emit('service_start', app.locals.access_token);
    await res.send('ok');
});

// 3. History
app.get('/history', async (req: Request, res: Response) => {
    await routes.history(req, res);
});

// 3. History
app.get('/intraday', async (req: Request, res: Response) => {
    await routes.intraday(req, res);
});

// 4. Quote
app.get('/quote', async (req: Request, res: Response) => {
    await routes.quote(req, res);
});

// 5. Option Chain
app.get('/option-chain', async (req: Request, res: Response) => {
    await routes.optionChain(req, res);
});

// use sockets later
app.get('/websocket/market', async (req, res) => {

    const wsAuthUrl = await routes.socketAuth('market', req.app.locals.access_token);

    const websocketUrl = wsAuthUrl.data.authorizedRedirectUri;

    if (!websocketUrl) {
        return res.status(401).send('Market Feed Auth Request Failure');
    }

    const ws = new WebSocket(websocketUrl, {
        headers: {
            Authorization: `Bearer ${req.app.locals.access_token}`,
            Accept: `application/json`,
        },
        followRedirects: true,
    });

    let marketProtoBuf = await initMarketProtoBuf();

    ws.on('open', async () => {
        console.log(`Connected to ${websocketUrl}`);


        setTimeout(() => {
            const data = {
                guid: Date.now().toString(36),
                method: "sub",
                data: {
                    mode: "full",
                    instrumentKeys: [/*"NSE_INDEX|Nifty Bank", */ "NSE_INDEX|Nifty 50"],
                },
            };
            ws.send(Buffer.from(JSON.stringify(data)));
        }, 1000);
    });

    ws.on('message', async (data) => {
        console.log('message received.');

        console.log(JSON.stringify(await decodeMarketFeed(marketProtoBuf, data), null, 2));
    });

    ws.on('close', (code, reason) => {
        console.log(`Connection closed: code ${code}, reason: ${reason}`);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error: ${error}`);
    });

    res.send('Connected to Socket data will be logged in console')
});

app.get('/websocket/portfolio', async (req, res) => {

    const wsAuthUrl = await routes.socketAuth('portfolio', req.app.locals.access_token);

    const websocketUrl = wsAuthUrl.data.authorizedRedirectUri;

    if (!websocketUrl) {
        return res.status(401).send('Market Feed Auth Request Failure');
    }

    const ws = new WebSocket(websocketUrl, {
        headers: {
            Authorization: `Bearer ${req.app.locals.access_token}`,
            Accept: `application/json`,
        },
        followRedirects: true,
    });


    ws.on('open', async () => {
        console.log(`Connected to ${websocketUrl}, data will be logged on order/position modified`);
    });

    ws.on('message', async (data) => {
        console.log('message received.');

        console.log(JSON.stringify(JSON.parse(data.toString()), null, 2));
    });

    ws.on('close', (code, reason) => {
        console.log(`Connection closed: code ${code}, reason: ${reason}`);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error: ${error}`);
    });

    res.send('Connected to Socket data will be logged in console')
});
