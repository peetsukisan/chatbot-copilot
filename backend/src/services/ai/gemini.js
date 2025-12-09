/**
 * Gemini AI Service
 * Handles all interactions with Google Gemini AI API
 * Includes key rotation for rate limit handling
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

let genAI = null;
let model = null;

/**
 * Initialize Gemini AI with current API key
 */
function initGemini() {
    const apiKey = config.gemini.getCurrentKey();
    if (!apiKey) {
        throw new Error('No Gemini API key configured');
    }
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: config.gemini.model });
    logger.info(`Gemini initialized with key index ${config.gemini.currentKeyIndex}`);
}

/**
 * Rotate to next API key (for rate limit handling)
 */
function rotateApiKey() {
    const newKey = config.gemini.getNextKey();
    genAI = new GoogleGenerativeAI(newKey);
    model = genAI.getGenerativeModel({ model: config.gemini.model });
    logger.info(`Rotated to Gemini key index ${config.gemini.currentKeyIndex}`);
}

/**
 * Execute with retry and key rotation
 */
async function executeWithRetry(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (error.message?.includes('429') || error.message?.includes('quota')) {
                logger.warn(`Rate limited on key ${config.gemini.currentKeyIndex}, rotating...`);
                rotateApiKey();
            } else if (i === maxRetries - 1) {
                throw error;
            }
            await sleep(1000 * (i + 1)); // Exponential backoff
        }
    }
}

/**
 * Generate a response based on context
 * @param {string} userMessage - User's message
 * @param {Array} context - Relevant context from vector DB
 * @param {object} customerInfo - Customer information
 */
async function generateResponse(userMessage, context = [], customerInfo = {}) {
    if (!model) initGemini();

    const contextText = context.map(c =>
        `คำถาม: ${c.question}\nคำตอบ: ${c.answer}`
    ).join('\n\n');

    const prompt = `คุณเป็น AI ผู้ช่วยตอบคำถามลูกค้าสำหรับธุรกิจการเงิน ตอบเป็นภาษาไทยสุภาพ ใช้ครับ/ค่ะ

ข้อมูลลูกค้า:
- ชื่อ: ${customerInfo.name || 'ลูกค้า'}
- ประวัติการติดต่อ: ${customerInfo.totalChats || 0} ครั้ง

บทสนทนาที่เกี่ยวข้องจากประวัติ:
${contextText || 'ไม่มีข้อมูลที่เกี่ยวข้อง'}

คำถามของลูกค้า: ${userMessage}

กรุณาตอบคำถามอย่างสุภาพ กระชับ และเป็นประโยชน์ ถ้าไม่แน่ใจให้แนะนำติดต่อเจ้าหน้าที่ในเวลาทำการ (10:00-22:00)`;

    return executeWithRetry(async () => {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        logger.debug(`Generated response for: ${userMessage.substring(0, 50)}...`);

        return {
            text,
            confidence: calculateConfidence(response),
            tokensUsed: response.usageMetadata?.totalTokenCount || 0
        };
    });
}

/**
 * Detect intent from user message (Feature #1)
 * @param {string} message - User's message
 */
async function detectIntent(message) {
    if (!model) initGemini();

    const prompt = `วิเคราะห์ข้อความของลูกค้าและระบุความต้องการ (intent) เป็น JSON

ข้อความ: "${message}"

ตอบเป็น JSON format เท่านั้น:
{
  "intent": "OPEN_ACCOUNT|TRANSFER|CARD|LOAN|COMPLAINT|GENERAL_INQUIRY|GREETING|OTHER",
  "confidence": 0.0-1.0,
  "keywords": ["keyword1", "keyword2"],
  "suggestedDepartment": "ฝ่ายที่เกี่ยวข้อง",
  "summary": "สรุปสั้นๆ ว่าลูกค้าต้องการอะไร"
}`;

    try {
        return await executeWithRetry(async () => {
            const result = await model.generateContent(prompt);
            const text = result.response.text();

            // Extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch (e) {
                    logger.warn('Failed to parse intent JSON, using default');
                }
            }

            return {
                intent: 'OTHER',
                confidence: 0.5,
                keywords: [],
                suggestedDepartment: 'ทั่วไป',
                summary: message
            };
        });
    } catch (error) {
        // All keys exhausted or other error - return default intent
        logger.warn(`Intent detection failed: ${error.message}, using default`);
        return {
            intent: 'GENERAL_INQUIRY',
            confidence: 0.3,
            keywords: [],
            suggestedDepartment: 'ทั่วไป',
            summary: message,
            error: true
        };
    }
}

/**
 * Summarize a conversation
 * @param {Array} messages - Array of messages
 */
async function summarizeConversation(messages) {
    if (!model) initGemini();

    const conversationText = messages.map(m =>
        `${m.from === 'customer' ? 'ลูกค้า' : 'เจ้าหน้าที่'}: ${m.text}`
    ).join('\n');

    const prompt = `สรุปบทสนทนาต่อไปนี้เป็นภาษาไทย ให้กระชับ 2-3 ประโยค:

${conversationText}

สรุป:`;

    return executeWithRetry(async () => {
        const result = await model.generateContent(prompt);
        return result.response.text();
    });
}

/**
 * Generate quick reply suggestions for staff (Feature #8)
 * @param {string} customerMessage - Customer's message
 * @param {Array} context - Relevant context
 */
async function generateQuickReplies(customerMessage, context = []) {
    if (!model) initGemini();

    const contextText = context.slice(0, 3).map(c =>
        `Q: ${c.question}\nA: ${c.answer}`
    ).join('\n\n');

    const prompt = `สร้างคำตอบแนะนำ 3 ข้อ สำหรับเจ้าหน้าที่ตอบลูกค้า

ข้อความลูกค้า: "${customerMessage}"

ตัวอย่างคำตอบจากประวัติ:
${contextText || 'ไม่มี'}

ตอบเป็น JSON array:
[
  {"text": "คำตอบที่ 1", "confidence": 0.9},
  {"text": "คำตอบที่ 2", "confidence": 0.8},
  {"text": "คำตอบที่ 3", "confidence": 0.7}
]`;

    return executeWithRetry(async () => {
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                logger.warn('Failed to parse quick replies JSON');
            }
        }

        return [
            { text: 'ได้เลยครับ กรุณารอสักครู่', confidence: 0.7 },
            { text: 'ขอข้อมูลเพิ่มเติมได้ไหมครับ', confidence: 0.6 },
            { text: 'สนใจบริการอื่นอีกไหมครับ', confidence: 0.5 }
        ];
    });
}

/**
 * Calculate confidence score from response
 */
function calculateConfidence(response) {
    // Simple heuristic based on response characteristics
    const text = response.text();

    let confidence = 0.8;

    // Lower confidence if response contains uncertainty phrases
    const uncertaintyPhrases = ['ไม่แน่ใจ', 'อาจจะ', 'น่าจะ', 'คิดว่า', 'ลองติดต่อ'];
    for (const phrase of uncertaintyPhrases) {
        if (text.includes(phrase)) {
            confidence -= 0.1;
        }
    }

    // Higher confidence for shorter, direct answers
    if (text.length < 100) confidence += 0.05;
    if (text.length > 500) confidence -= 0.1;

    return Math.max(0.3, Math.min(1.0, confidence));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize on module load
try {
    initGemini();
} catch (e) {
    logger.warn('Gemini not initialized on load (missing API key?)');
}

module.exports = {
    generateResponse,
    detectIntent,
    summarizeConversation,
    generateQuickReplies,
    rotateApiKey
};
