/**
 * Message Processor Service
 * Central logic for processing incoming messages
 */

const { generateResponse, detectIntent, generateQuickReplies } = require('../ai/gemini');
const { queryRelevant } = require('../vector/pinecone');
const { shouldEscalate } = require('../ai/escalation');
const { getOrCreateCustomer, updateCustomerActivity } = require('../../models/customer');
const { saveMessage, getRecentMessages } = require('../../models/chat');
const { getUserProfile } = require('../facebook/messenger');
const logger = require('../../utils/logger');
const config = require('../../utils/config');

/**
 * Process incoming message
 * @param {string} senderId - Facebook sender ID
 * @param {string} messageText - Message content
 * @param {object} options - Processing options
 */
async function processMessage(senderId, messageText, options = {}) {
    const { mode = 'ai-auto' } = options;

    try {
        // Get or create customer profile
        let customerInfo = await getOrCreateCustomer(senderId);

        // If new customer, fetch profile from Facebook
        if (!customerInfo.name) {
            const fbProfile = await getUserProfile(senderId);
            if (fbProfile) {
                customerInfo.name = `${fbProfile.first_name} ${fbProfile.last_name}`.trim();
                customerInfo.profilePic = fbProfile.profile_pic;
            }
        }

        // Detect intent (Feature #1)
        const intent = await detectIntent(messageText);
        logger.debug(`Detected intent: ${intent.intent} (${intent.confidence})`);

        // Get relevant context from vector DB
        const context = await queryRelevant(messageText, config.ai.maxContextMessages);
        logger.debug(`Found ${context.length} relevant context items`);

        // Save incoming message
        await saveMessage({
            senderId,
            text: messageText,
            sender: 'customer',
            intent: intent.intent,
            intentConfidence: intent.confidence
        });

        // Update customer activity
        await updateCustomerActivity(senderId, {
            lastContact: new Date(),
            lastIntent: intent.intent
        });

        if (mode === 'ai-auto') {
            // AI handles fully (outside business hours)
            return await processWithAI(senderId, messageText, context, customerInfo, intent);
        } else {
            // Staff-assist mode (during business hours)
            return await processWithStaffAssist(senderId, messageText, context, customerInfo, intent);
        }
    } catch (error) {
        logger.error(`Error processing message: ${error.message}`);
        return {
            aiResponse: 'ขออภัยครับ ระบบขัดข้อง กรุณาลองใหม่อีกครั้งหรือติดต่อเจ้าหน้าที่ในเวลาทำการครับ',
            confidence: 0,
            shouldEscalate: true,
            escalationReason: 'system_error',
            priority: 'high'
        };
    }
}

/**
 * Process with AI auto-response (outside business hours)
 */
async function processWithAI(senderId, messageText, context, customerInfo, intent) {
    // Generate AI response
    const aiResult = await generateResponse(messageText, context, customerInfo);

    // Check if escalation is needed (Feature #9)
    const escalationCheck = await shouldEscalate(messageText, {
        response: aiResult.text,
        confidence: aiResult.confidence,
        intent
    });

    // Save AI response
    await saveMessage({
        senderId,
        text: aiResult.text,
        sender: 'ai',
        confidence: aiResult.confidence,
        escalated: escalationCheck.shouldEscalate
    });

    return {
        aiResponse: aiResult.text,
        confidence: aiResult.confidence,
        intent: intent.intent,
        intentConfidence: intent.confidence,
        shouldEscalate: escalationCheck.shouldEscalate,
        escalationReason: escalationCheck.reason,
        priority: escalationCheck.priority,
        customerInfo,
        tokensUsed: aiResult.tokensUsed
    };
}

/**
 * Process with staff assistance (during business hours)
 */
async function processWithStaffAssist(senderId, messageText, context, customerInfo, intent) {
    // Generate quick reply suggestions for staff (Feature #8)
    const suggestedReplies = await generateQuickReplies(messageText, context);

    // Get recent conversation history
    const recentMessages = await getRecentMessages(senderId, 10);

    return {
        mode: 'staff-assist',
        messageText,
        suggestedReplies,
        intent: intent.intent,
        intentConfidence: intent.confidence,
        intentSummary: intent.summary,
        suggestedDepartment: intent.suggestedDepartment,
        customerInfo,
        recentMessages,
        context
    };
}

/**
 * Process staff reply and save
 * @param {string} senderId - Customer's Facebook ID
 * @param {string} staffId - Staff member ID
 * @param {string} replyText - Staff's reply
 */
async function processStaffReply(senderId, staffId, replyText) {
    // Save staff message
    await saveMessage({
        senderId,
        text: replyText,
        sender: 'staff',
        staffId
    });

    // Update customer activity
    await updateCustomerActivity(senderId, {
        lastContact: new Date(),
        lastContactBy: 'staff'
    });

    return { success: true };
}

module.exports = {
    processMessage,
    processStaffReply
};
