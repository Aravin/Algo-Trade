import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone  from 'dayjs/plugin/timezone';
import cron from 'node-cron';
import { core } from './core';
import { log } from '../../helpers/log';
import { ddbClient } from '../../utils/db';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Kolkata");

cron.schedule('35 30-59/1 9 * * 1-5', () => {
    log.info(`Service Running... - ${dayjs().format('hh:mm:ss')}`);
    run();
}, { timezone: 'Asia/Kolkata' });

cron.schedule('35 * 10-14 * * 1-5', () => {
    log.info(`Service Running... - ${dayjs().format('hh:mm:ss')}`);
    run();
}, { timezone: 'Asia/Kolkata' });

const run = async () => {
    try {
        // from aws
        const data = await ddbClient.get();
        core(data);
    }
    catch (err: any) {
        log.error(err?.message);
        log.error('Error: Retry at next attempt. ');
    }
}
