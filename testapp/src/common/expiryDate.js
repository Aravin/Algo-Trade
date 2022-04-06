const dayjs = require('dayjs');
const weekday = require('dayjs/plugin/weekday');
dayjs.extend(weekday);

// remove holiday
const holidays = [
    '2022-01-26',
    '2022-03-01',
    '2022-03-18',
    '2022-04-14',
    '2022-04-15',
    '2022-05-03',
    '2022-08-09',
    '2022-08-15',
    '2022-08-31',
    '2022-10-05',
    '2022-10-24',
    '2022-10-26',
    '2022-11-08',
]

// find thursday
module.exports = findNextExpiry = () => {
    const now = dayjs();
    let nextExpiryDay;
    
    if (now.weekday() < 4) {
        nextExpiryDay = now.weekday(4);
    }
    else if (now.weekday() === 4) { // 0 - sunday 4 - thursday
        nextExpiryDay = now.add(7, 'day');
    }
    else {
        nextExpiryDay = now.add(7, 'day').weekday(4);
    }

    let newExpiryDay = removeHoliday(nextExpiryDay);
    const diffInDays = nextExpiryDay.diff(newExpiryDay, 'day');

    if (diffInDays > 3) {
        newExpiryDay = newExpiryDay.add(7 + diffInDays, 'day');
    }

    // TODO: handle if multiple week ends in holiday. IMPORTANT
    return newExpiryDay.format('DDMMMYY').toUpperCase();
}

// remove holiday
const removeHoliday = (date) => {
    let nextExpiryDay = date;

    if (nextExpiryDay.diff(dayjs(), 'day') <= 0) {
        return nextExpiryDay;
    }
    
    if (holidays.includes(nextExpiryDay.format('YYYY-MM-DD'))) { 
        nextExpiryDay = nextExpiryDay.subtract(1, 'day')
    } else {
        return nextExpiryDay;
    }

    return removeHoliday(nextExpiryDay);
}
