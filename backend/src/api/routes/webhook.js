/**
 * Facebook Messenger Webhook Handler
 * Receives and processes messages from Facebook Messenger
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const config = require('../../utils/config');
const logger = require('../../utils/logger');
const { isBusinessHours, getBusinessStatus } = require('../../utils/businessHours');
const { processMessage } = require('../../services/chat/processor');
const { sendMessage, sendQuickReplies } = require('../../services/facebook/messenger');
const { getMenuOptions } = require('../../models/menuOption');
const { analyzeImage, createRagDescription } = require('../../services/ai/vision');
const { addDocuments } = require('../../services/vector/pinecone');

/**
 * Webhook Verification (GET)
 * Facebook sends a GET request to verify the webhook
 */
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === config.facebook.verifyToken) {
            logger.info('Webhook verified successfully');
            res.status(200).send(challenge);
        } else {
            logger.warn('Webhook verification failed - token mismatch');
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

/**
 * Verify request signature from Facebook
 */
function verifyRequestSignature(req, res, buf) {
    const signature = req.headers['x-hub-signature-256'];

    if (!signature) {
        logger.warn('No signature in request');
        return;
    }

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', config.facebook.appSecret)
        .update(buf)
        .digest('hex');

    if (signature !== expectedSignature) {
        logger.error('Invalid signature');
        throw new Error('Invalid signature');
    }
}

/**
 * Webhook Messages Handler (POST)
 * Receives incoming messages from Facebook
 */
router.post('/', async (req, res) => {
    const body = req.body;

    // Verify this is from a Page subscription
    if (body.object !== 'page') {
        logger.warn('Received non-page webhook event');
        return res.sendStatus(404);
    }

    // Return 200 immediately to prevent timeout
    res.status(200).send('EVENT_RECEIVED');

    // Process each entry
    for (const entry of body.entry) {
        const webhookEvent = entry.messaging?.[0];

        if (!webhookEvent) continue;

        const senderId = webhookEvent.sender.id;
        const io = req.app.get('io');

        try {
            // Handle different event types
            if (webhookEvent.message) {
                await handleMessage(senderId, webhookEvent.message, io);
            } else if (webhookEvent.postback) {
                await handlePostback(senderId, webhookEvent.postback, io);
            }
        } catch (error) {
            logger.error(`Error processing webhook event: ${error.message}`, error);
        }
    }
});

/**
 * Handle incoming messages (text and images)
 */
async function handleMessage(senderId, message, io) {
    const messageText = message.text;
    const messageId = message.mid;
    const attachments = message.attachments;

    // Handle image attachments
    if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
            if (attachment.type === 'image') {
                await handleImageMessage(senderId, attachment.payload.url, io);
            }
        }
        // If only image, return
        if (!messageText) return;
    }

    // Handle text message
    if (!messageText) {
        logger.debug('Received non-text message (sticker, etc.)');
        return;
    }

    logger.info(`Received message from ${senderId}: ${messageText}`);

    // Emit to admin dashboard in real-time (always, even in learning mode)
    io.to('admin-room').emit('new-message', {
        senderId,
        messageText,
        messageId,
        timestamp: new Date().toISOString()
    });

    // LEARNING MODE: Only collect data, do NOT respond to customers
    if (config.learningMode) {
        logger.info(`[LEARNING MODE] Message logged but NOT responding to ${senderId}`);

        // Still save the message for analysis
        const { saveMessage } = require('../../models/chat');
        const { getOrCreateCustomer } = require('../../models/customer');

        await getOrCreateCustomer(senderId);
        await saveMessage({
            senderId,
            text: messageText,
            sender: 'customer',
            intent: 'UNKNOWN',
            intentConfidence: 0
        });

        return; // Do not respond
    }

    // Check business hours (only when NOT in learning mode)
    const businessStatus = getBusinessStatus();

    if (businessStatus.isOpen) {
        await handleDuringBusinessHours(senderId, messageText, io);
    } else {
        await handleOutsideBusinessHours(senderId, messageText, io);
    }
}

/**
 * Handle image messages - analyze with Gemini Vision
 */
async function handleImageMessage(senderId, imageUrl, io) {
    logger.info(`Received image from ${senderId}`);

    // LEARNING MODE: Only log, do NOT respond
    if (config.learningMode) {
        logger.info(`[LEARNING MODE] Image received but NOT processing for ${senderId}`);

        // Emit to admin dashboard
        io.to('admin-room').emit('image-received', {
            senderId,
            imageUrl,
            learningMode: true,
            timestamp: new Date().toISOString()
        });

        return; // Do not respond or analyze
    }

    // Acknowledge receipt (only when NOT in learning mode)
    await sendMessage(senderId, 'ได้รับรูปภาพแล้วครับ กำลังวิเคราะห์...');

    try {
        // Analyze image with Gemini Vision
        const analysis = await analyzeImage(imageUrl);

        if (analysis.success) {
            // Create description for RAG
            const ragDescription = createRagDescription(analysis);

            // Send analysis result to customer
            let responseText = '';
            if (analysis.type === 'slip' || analysis.type === 'สลิปโอนเงิน') {
                responseText = `📋 ได้รับสลิปแล้วครับ\n`;
                if (analysis.details.amount) responseText += `💰 จำนวน: ${analysis.details.amount}\n`;
                if (analysis.details.date) responseText += `📅 วันที่: ${analysis.details.date}\n`;
                if (analysis.details.reference) responseText += `🔖 อ้างอิง: ${analysis.details.reference}`;
            } else {
                responseText = `📋 วิเคราะห์รูปแล้ว:\n${analysis.summary}`;
            }

            await sendMessage(senderId, responseText);

            // Store in RAG for learning
            if (ragDescription) {
                await addDocuments([{
                    question: `ลูกค้าส่งรูป: ${analysis.type}`,
                    answer: analysis.summary,
                    conversationId: `img_${senderId}_${Date.now()}`,
                    customerId: senderId,
                    timestamp: new Date().toISOString()
                }]);
                logger.info('Image analysis stored in RAG');
            }

            // Emit to admin dashboard
            io.to('admin-room').emit('image-received', {
                senderId,
                imageUrl,
                analysis,
                timestamp: new Date().toISOString()
            });

        } else {
            await sendMessage(senderId, 'ไม่สามารถวิเคราะห์รูปได้ครับ กรุณาลองส่งใหม่หรือติดต่อเจ้าหน้าที่');
        }

    } catch (error) {
        logger.error(`Image analysis error: ${error.message}`);
        await sendMessage(senderId, 'เกิดข้อผิดพลาดในการวิเคราะห์รูป กรุณาลองใหม่อีกครั้งครับ');
    }
}

/**
 * Handle messages during business hours (10:00-22:00)
 */
async function handleDuringBusinessHours(senderId, messageText, io) {
    const menuOptions = await getMenuOptions();
    const isFirstMessage = await isFirstMessageInSession(senderId);

    if (isFirstMessage) {
        const welcomeText = `สวัสดีครับ! ยินดีต้อนรับสู่บริการของเรา\nกรุณาเลือกหัวข้อที่ต้องการสอบถาม:`;

        const quickReplies = menuOptions.map(opt => ({
            content_type: 'text',
            title: `${opt.emoji} ${opt.text}`,
            payload: `MENU_${opt.id}`
        }));

        await sendQuickReplies(senderId, welcomeText, quickReplies);
    } else {
        const result = await processMessage(senderId, messageText, { mode: 'staff-assist' });

        io.to('admin-room').emit('staff-required', {
            senderId,
            messageText,
            suggestedReplies: result.suggestedReplies,
            intent: result.intent,
            customerInfo: result.customerInfo,
            timestamp: new Date().toISOString()
        });

        await sendMessage(senderId, 'ได้รับข้อความแล้วครับ รอสักครู่นะครับ เจ้าหน้าที่กำลังดูแลอยู่ครับ');
    }
}

/**
 * Handle messages outside business hours - AI handles
 */
async function handleOutsideBusinessHours(senderId, messageText, io) {
    const result = await processMessage(senderId, messageText, { mode: 'ai-auto' });

    if (result.shouldEscalate) {
        io.to('admin-room').emit('escalation-needed', {
            senderId,
            messageText,
            reason: result.escalationReason,
            priority: result.priority,
            timestamp: new Date().toISOString()
        });

        await sendMessage(senderId,
            'ขอบคุณสำหรับข้อความครับ เรื่องนี้ต้องให้เจ้าหน้าที่ดูแลโดยตรง ' +
            'จะมีเจ้าหน้าที่ติดต่อกลับในเวลาทำการ (10:00-22:00) ครับ'
        );
    } else {
        await sendMessage(senderId, result.aiResponse);

        if (result.confidence < config.ai.confidenceThreshold) {
            await sendMessage(senderId,
                'หากคำตอบไม่ตรงกับที่ต้องการ สามารถสอบถามเจ้าหน้าที่ได้ในเวลาทำการ (10:00-22:00) ครับ'
            );
        }
    }

    io.to('admin-room').emit('ai-response', {
        senderId,
        messageText,
        aiResponse: result.aiResponse,
        confidence: result.confidence,
        intent: result.intent,
        timestamp: new Date().toISOString()
    });
}

/**
 * Handle postback events (button clicks)
 */
async function handlePostback(senderId, postback, io) {
    const payload = postback.payload;

    logger.info(`Received postback from ${senderId}: ${payload}`);

    if (payload.startsWith('MENU_')) {
        const menuId = parseInt(payload.replace('MENU_', ''));
        await handleMenuSelection(senderId, menuId, io);
    }
}

/**
 * Handle menu option selection
 */
async function handleMenuSelection(senderId, menuId, io) {
    const menuOptions = await getMenuOptions();
    const selectedOption = menuOptions.find(opt => opt.id === menuId);

    if (selectedOption && selectedOption.auto_response) {
        await sendMessage(senderId, selectedOption.auto_response);
    }

    io.to('admin-room').emit('menu-selected', {
        senderId,
        menuId,
        menuText: selectedOption?.text,
        timestamp: new Date().toISOString()
    });
}

/**
 * Check if this is the first message in a session
 */
async function isFirstMessageInSession(senderId) {
    // TODO: Check database for recent conversations
    return false;
}

module.exports = router;
