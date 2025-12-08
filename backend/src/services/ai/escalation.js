/**
 * Smart Escalation Service (Feature #9)
 * Determines when to escalate to human staff
 */

const { detectIntent } = require('./gemini');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

// Sensitive topics that always require human review
const SENSITIVE_TOPICS = [
    'ร้องเรียน', 'complaint', 'ไม่พอใจ', 'โกรธ', 'หลอก', 'ฉ้อโกง',
    'ปัญหา', 'เงินหาย', 'ผิดพลาด', 'error', 'ฟ้องร้อง', 'legal',
    'เสียหาย', 'ขอยกเลิก', 'ปิดบัญชี', 'urgent', 'ด่วน'
];

// Frustration indicators
const FRUSTRATION_INDICATORS = [
    'ไม่เข้าใจ', 'พูดซ้ำ', 'อีกแล้ว', 'กี่ครั้ง', 'เมื่อไหร่',
    'ทำไม', 'ช้า', 'รอนาน', '!!!', '???', 'เบื่อ'
];

/**
 * Determine if escalation is needed
 * @param {string} message - Customer's message
 * @param {object} aiResponse - AI response info
 */
async function shouldEscalate(message, aiResponse) {
    const factors = {
        lowConfidence: false,
        sensitiveTopics: false,
        customerFrustration: false,
        highValueIntent: false,
        explicitRequest: false
    };

    // Factor 1: Low AI confidence
    if (aiResponse.confidence < config.ai.confidenceThreshold) {
        factors.lowConfidence = true;
        logger.debug(`Escalation factor: Low confidence (${aiResponse.confidence})`);
    }

    // Factor 2: Sensitive topics
    const messageLower = message.toLowerCase();
    for (const topic of SENSITIVE_TOPICS) {
        if (messageLower.includes(topic.toLowerCase())) {
            factors.sensitiveTopics = true;
            logger.debug(`Escalation factor: Sensitive topic (${topic})`);
            break;
        }
    }

    // Factor 3: Customer frustration
    let frustrationScore = 0;
    for (const indicator of FRUSTRATION_INDICATORS) {
        if (messageLower.includes(indicator.toLowerCase())) {
            frustrationScore++;
        }
    }
    if (frustrationScore >= 2) {
        factors.customerFrustration = true;
        logger.debug(`Escalation factor: Customer frustration (score: ${frustrationScore})`);
    }

    // Factor 4: High-value intents that need human touch
    const highValueIntents = ['COMPLAINT', 'LOAN', 'ACCOUNT_CLOSE'];
    if (aiResponse.intent && highValueIntents.includes(aiResponse.intent.intent)) {
        factors.highValueIntent = true;
        logger.debug(`Escalation factor: High-value intent (${aiResponse.intent.intent})`);
    }

    // Factor 5: Explicit request for human
    const humanRequestPhrases = ['ขอคุยกับคน', 'ขอเจ้าหน้าที่', 'พูดกับคน', 'operator', 'staff', 'human'];
    for (const phrase of humanRequestPhrases) {
        if (messageLower.includes(phrase.toLowerCase())) {
            factors.explicitRequest = true;
            logger.debug(`Escalation factor: Explicit human request`);
            break;
        }
    }

    // Determine if escalation is needed
    const shouldEscalate = Object.values(factors).some(f => f);

    // Calculate priority
    let priority = 'low';
    const activeFactors = Object.values(factors).filter(f => f).length;

    if (factors.sensitiveTopics || factors.explicitRequest || activeFactors >= 3) {
        priority = 'high';
    } else if (factors.customerFrustration || factors.highValueIntent || activeFactors >= 2) {
        priority = 'medium';
    }

    // Get reason
    const reason = getEscalationReason(factors);

    return {
        shouldEscalate,
        factors,
        reason,
        priority
    };
}

/**
 * Get human-readable escalation reason
 */
function getEscalationReason(factors) {
    const reasons = [];

    if (factors.lowConfidence) reasons.push('AI ไม่แน่ใจในคำตอบ');
    if (factors.sensitiveTopics) reasons.push('เรื่องที่ต้องพิจารณาเป็นพิเศษ');
    if (factors.customerFrustration) reasons.push('ลูกค้าอาจไม่พอใจ');
    if (factors.highValueIntent) reasons.push('เรื่องสำคัญ');
    if (factors.explicitRequest) reasons.push('ลูกค้าขอคุยกับเจ้าหน้าที่');

    return reasons.join(', ') || 'ไม่ระบุ';
}

/**
 * Analyze sentiment (simple version)
 * Returns: 1 = positive, 0 = neutral, -1 = negative
 */
function analyzeSentiment(message) {
    const positiveWords = ['ขอบคุณ', 'ดี', 'เยี่ยม', 'สุดยอด', 'ประทับใจ', 'พอใจ'];
    const negativeWords = ['ไม่ดี', 'แย่', 'ไม่พอใจ', 'ผิดหวัง', 'โกรธ', 'เสียใจ'];

    let score = 0;
    const lower = message.toLowerCase();

    for (const word of positiveWords) {
        if (lower.includes(word)) score++;
    }

    for (const word of negativeWords) {
        if (lower.includes(word)) score--;
    }

    if (score > 0) return 1;
    if (score < 0) return -1;
    return 0;
}

module.exports = {
    shouldEscalate,
    analyzeSentiment,
    getEscalationReason
};
