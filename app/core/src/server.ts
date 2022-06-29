import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { core, resetTrades } from './core';
import { log } from './helpers/log';

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

app.get('/reset', (req: Request, res: Response) => {
    resetTrades()
    log.info(`Day's trade data reset successful`);
    res.send('OK')
})

app.listen(port, () => {
    log.info(`Algo Trade app listening on port ${port}`)
});
