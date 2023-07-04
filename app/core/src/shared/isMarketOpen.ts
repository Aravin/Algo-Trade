import dayjs from "dayjs";

export const isMarketClosed = () => {
    const shortTime = +dayjs.tz(new Date()).format('HHmm');
    return shortTime < 930 || shortTime >= 1458;
}

export const isMarketOpen = () => {
    return !isMarketClosed();
}
