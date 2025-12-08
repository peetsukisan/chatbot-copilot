/**
 * Chat API Routes
 */

const express = require('express');
const router = express.Router();

const { getMessages, getRecentMessages, saveMessage, getMessageStats } = require('../../models/chat');
const { processStaffReply } = require('../../services/chat/processor');
const { sendMessage } = require('../../services/facebook/messenger');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

// Auth middleware
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || token !== config.admin.apiToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

router.use(authMiddleware);

/**
 * GET /api/chats
 * Get messages with filters
 */
router.get('/', async (req, res) => {
    try {
        const options = {
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0,
            senderId: req.query.senderId,
            sender: req.query.sender,
            intent: req.query.intent,
            since: req.query.since
        };

        const messages = await getMessages(options);

        res.json({
            success: true,
            data: messages
        });
    } catch (error) {
        logger.error(`Chat list error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/chats/stats
 * Get message statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const period = req.query.period || '7d';
        const stats = await getMessageStats(period);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error(`Chat stats error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/chats/:senderId
 * Get chat history for specific customer
 */
router.get('/:senderId', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const messages = await getRecentMessages(req.params.senderId, limit);

        res.json({
            success: true,
            data: messages
        });
    } catch (error) {
        logger.error(`Chat history error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/chats/:senderId/reply
 * Send staff reply to customer
 */
router.post('/:senderId/reply', async (req, res) => {
    try {
        const { text, staffId } = req.body;
        const senderId = req.params.senderId;

        if (!text) {
            return res.status(400).json({ error: 'Message text is required' });
        }

        // Send message via Facebook
        await sendMessage(senderId, text);

        // Process and save staff reply
        await processStaffReply(senderId, staffId || 'admin', text);

        // Emit to admin dashboard
        const io = req.app.get('io');
        io.to('admin-room').emit('staff-replied', {
            senderId,
            text,
            staffId: staffId || 'admin',
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Reply sent successfully'
        });
    } catch (error) {
        logger.error(`Chat reply error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
