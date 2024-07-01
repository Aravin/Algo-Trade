// Function to format date to IST (GMT+5:30)
export const getISTTime = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',    // IST time zone
        hour12: false,              // Use 24-hour format
        hour: '2-digit',             // Use "2-digit" for the correct format
        minute: '2-digit',           // Use "2-digit" 
        second: '2-digit'            // Use "2-digit"
    };
    return now.toLocaleTimeString('en-IN', options); // 'en-IN' for IST format
};