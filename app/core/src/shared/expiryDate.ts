import dayjs from 'dayjs';
import weekday from 'dayjs/plugin/weekday';

dayjs.extend(weekday);

// remove holiday
const holidays = [
    '2023-08-15',
    '2023-09-19',
    '2023-10-02',
    '2023-10-24',
    '2023-11-14',
    '2023-11-27',
    '2023-12-25',
]

// find thursday
export const findNextExpiry = () => {
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
    return { expiryDate: newExpiryDay.format('DDMMMYY').toUpperCase(), daysLeft: newExpiryDay.diff(now, 'day')};
}

// remove holiday
const removeHoliday = (date: any): any => {
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
