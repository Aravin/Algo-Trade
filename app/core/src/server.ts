import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { core, exitTrade, resetTrades, scheduleCron, setToken } from '.';
import { log } from './utils/log';
import { appConfig } from './config/app';
import { login } from './brokers/finvasia/apis/login';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Kolkata");

const app = express();
const port = 3000;

app.use(bodyParser.json());

app.post('/', (req: Request, res: Response) => {
    core(req.body);
    res.send('OK')
});

app.post('/app/token/generate', async (req: Request, res: Response) => {
    const apiResponse = await login(req.body.authCode);
    log.info(`Received token ${apiResponse?.susertoken}`);
    setToken(apiResponse?.susertoken);
    res.send('OK');
});

app.post('/app/set-token', (req: Request, res: Response) => {
    setToken(req.body.token);
    log.info(`Token set!`);
    res.send('OK');
});

app.get('/app/get-token', (req: Request, res: Response) => {
    res.send(appConfig.token);
});

app.get('/trade/reset', async (req: Request, res: Response) => {
    await resetTrades()
    log.info(`Day's trade data reset successful`);
    res.send('OK');
});

app.get('/trade/exit', async (req: Request, res: Response) => {
    await exitTrade()
    res.send('OK - order exited');
});

app.listen(port, () => {
    log.info(`Algo Trade app listening on port ${port}`);
    scheduleCron('35 30-59/1 9 * * 1-5');
    scheduleCron('35 * 10-14 * * 1-5');
    log.info('Cron Started!');
});
