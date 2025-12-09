/**
 * Business Hours Utility
 * Checks if current time is within business hours (10:00-22:00 daily)
 */

const config = require('./config');

/**
 * Get current time in Bangkok timezone
 * Using simple offset calculation to avoid date-fns-tz issues
 */
function getBangkokTime() {
    const now = new Date();
    // Bangkok is UTC+7
    const bangkokOffset = 7 * 60; // minutes
    const localOffset = now.getTimezoneOffset(); // minutes (negative for positive offsets)
    const bangkokTime = new Date(now.getTime() + (bangkokOffset + localOffset) * 60 * 1000);
    return bangkokTime;
}

/**
 * Check if current time is within business hours
 * @returns {boolean} true if within business hours
 */
function isBusinessHours() {
    const now = getBangkokTime();

    const [startHour, startMin] = config.businessHours.start.split(':').map(Number);
    const [endHour, endMin] = config.businessHours.end.split(':').map(Number);

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTime = currentHour * 60 + currentMin;

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    return currentTime >= startTime && currentTime < endTime;
}

/**
 * Get current status message
 * @returns {object} Status info with isOpen and message
 */
function getBusinessStatus() {
    const isOpen = isBusinessHours();
    const { start, end } = config.businessHours;

    if (isOpen) {
        return {
            isOpen: true,
            message: `เจ้าหน้าที่พร้อมให้บริการครับ (${start} - ${end})`,
            messageEn: `Staff available (${start} - ${end})`
        };
    } else {
        return {
            isOpen: false,
            message: `ขณะนี้อยู่นอกเวลาทำการ (${start} - ${end}) ระบบ AI จะช่วยตอบคำถามเบื้องต้นครับ`,
            messageEn: `Outside business hours (${start} - ${end}). AI assistant will help you.`
        };
    }
}

/**
 * Get time until business hours open/close
 * @returns {object} Minutes until next state change
 */
function getTimeUntilChange() {
    const now = getBangkokTime();

    const [startHour, startMin] = config.businessHours.start.split(':').map(Number);
    const [endHour, endMin] = config.businessHours.end.split(':').map(Number);

    const currentTime = now.getHours() * 60 + now.getMinutes();
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    const isOpen = currentTime >= startTime && currentTime < endTime;

    if (isOpen) {
        // Time until closing
        return {
            event: 'close',
            minutes: endTime - currentTime
        };
    } else if (currentTime < startTime) {
        // Time until opening (same day)
        return {
            event: 'open',
            minutes: startTime - currentTime
        };
    } else {
        // Time until opening (next day)
        return {
            event: 'open',
            minutes: (24 * 60 - currentTime) + startTime
        };
    }
}

module.exports = {
    isBusinessHours,
    getBusinessStatus,
    getTimeUntilChange
};
