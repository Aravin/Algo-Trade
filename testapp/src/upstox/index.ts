import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';

import * as routes from './routes';
import * as middlewares from './middlewares';

dotenv.config();

const app = express();
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
    console.log({body: req.body, params: req.params, query: req.query});

    if (req.query.code) {
        console.log('Auth Success!');
        app.locals.token = req.query.code;
    } else {
        console.log('Auth Failed!');
    }

    res.json({ message: 'Success'});
});

// 2. Token
app.get('/token', async (req: Request, res: Response) => {
    await routes.token(req, res);
})