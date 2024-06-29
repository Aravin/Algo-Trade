// 2024 holiday
const holidays = ['17-Jul-2024',
    '15-Aug-2024',
    '02-Oct-2024',
    '01-Nov-2024',
    '15-Nov-2024',
    '25-Dec-2024'];

export function getNextWorkingThursday(date = new Date()): string {
    const nextThursday = getNextThursday(date);
    return checkAndAdjustForHolidays(nextThursday);
}

function getNextThursday(date: Date): string {
    const today = new Date(date);
    const dayOfWeek = today.getDay();

    // Calculate days until next Thursday
    const daysUntilNextThursday = (11 - dayOfWeek) % 7;

    // Set the date to next Thursday
    today.setDate(today.getDate() + daysUntilNextThursday);

    return formatDate(today); // Use the common format function
}

function checkAndAdjustForHolidays(dateString: string): string {
    let currentDate = new Date(dateString);

    while (isHoliday(currentDate)) {
        currentDate.setDate(currentDate.getDate() + 1); // Move to the next day
        currentDate = new Date(formatDate(currentDate));
    }
    return formatDate(currentDate);
}

function isHoliday(date: Date): boolean {
    return holidays.includes(formatDate(date));
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`; // Consistent YYYY-MM-DD format
}