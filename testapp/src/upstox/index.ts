import express, { Request, Response } from 'express';
import { WebSocket } from 'ws';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';

import * as routes from './routes';
import * as middlewares from './middlewares';
import { appConfig } from './config';
import axios, { AxiosRequestConfig } from 'axios';

dotenv.config();

const app = express();
app.locals.access_token = appConfig.accessToken;
app.locals.code = appConfig.authCode;

app.use(cors());
app.use(bodyParser.json());
app.use(middlewares.errorHandler);

app.listen(3000, async () => {
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

    res.json({ message: 'Success' });
});

// 2. Token
app.get('/token', async (req: Request, res: Response) => {
    await routes.token(req, res);
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

// websocket auth
app.get('/websocket/auth', async (req: Request, res: Response) => {
    await routes.socketAuth(req, res);
});
app.get('/websocket', async (req, res) => {
    const websocketUrl = 'wss://api.upstox.com/v2/feed/market-data-feed/authorize';
    console.log(`using token: ${req.app.locals.access_token}`)
    const ws = new WebSocket(websocketUrl, {
        headers: {
            Authorization: `Bearer ${req.app.locals.access_token}`,
            Accept: `application/json`,
        }
    })

    ws.on('open', () => {
        console.log(`Connected to ${websocketUrl}`);
    });

    ws.on('message', (data) => {
        console.log(`Received message: ${data.toString()}`);
    });

    ws.on('close', (code, reason) => {
        console.log(`Connection closed: code ${code}, reason: ${reason}`);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error: ${error}`);
    });
})