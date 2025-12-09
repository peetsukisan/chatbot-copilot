/**
 * Pending Messages API Routes
 * Manage messages in test mode queue
 */

const express = require('express');
const router = express.Router();

const {
    getPendingMessages,
    approvePendingMessage,
    rejectPendingMessage,
    markMessageSent,
    getApprovedMessages,
    getPendingStats
} = require('../../models/pendingMessage');
const { forceSendMessage } = require('../../services/facebook/messenger');
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
 * GET /api/pending
 * Get all pending messages
 */
router.get('/', async (req, res) => {
    try {
        const status = req.query.status || 'pending';
        const messages = getPendingMessages(status);
        const stats = getPendingStats();

        res.json({
            success: true,
            testMode: config.testMode,
            data: messages,
            stats
        });
    } catch (error) {
        logger.error(`Pending list error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/pending/stats
 * Get pending messages statistics
 */
router.get('/stats', (req, res) => {
    try {
        const stats = getPendingStats();

        res.json({
            success: true,
            testMode: config.testMode,
            data: stats
        });
    } catch (error) {
        logger.error(`Pending stats error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/pending/:id/approve
 * Approve a pending message (mark ready to send)
 */
router.post('/:id/approve', async (req, res) => {
    try {
        const message = approvePendingMessage(req.params.id);

        res.json({
            success: true,
            message: 'Message approved',
            data: message
        });
    } catch (error) {
        logger.error(`Approve error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/pending/:id/reject
 * Reject a pending message
 */
router.post('/:id/reject', async (req, res) => {
    try {
        rejectPendingMessage(req.params.id);

        res.json({
            success: true,
            message: 'Message rejected'
        });
    } catch (error) {
        logger.error(`Reject error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/pending/:id/send
 * Actually send an approved message to Facebook
 */
router.post('/:id/send', async (req, res) => {
    try {
        const messages = getPendingMessages('approved');
        const message = messages.find(m => m.id === req.params.id);

        if (!message) {
            return res.status(404).json({ error: 'Approved message not found' });
        }

        // Send via Facebook
        await forceSendMessage(message.recipient_id, message.message);

        // Mark as sent
        markMessageSent(message.id);

        res.json({
            success: true,
            message: 'Message sent successfully'
        });
    } catch (error) {
        logger.error(`Send error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/pending/send-all
 * Send all approved messages
 */
router.post('/send-all', async (req, res) => {
    try {
        const messages = getApprovedMessages();
        let sent = 0;
        let failed = 0;

        for (const message of messages) {
            try {
                await forceSendMessage(message.recipient_id, message.message);
                markMessageSent(message.id);
                sent++;
            } catch (e) {
                logger.error(`Failed to send message ${message.id}: ${e.message}`);
                failed++;
            }
        }

        res.json({
            success: true,
            message: `Sent ${sent} messages, ${failed} failed`
        });
    } catch (error) {
        logger.error(`Send all error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/pending/test-mode
 * Get current test mode status
 */
router.get('/test-mode', (req, res) => {
    res.json({
        success: true,
        testMode: config.testMode
    });
});

/**
 * POST /api/pending/test-mode
 * Toggle test mode (runtime only, not persistent)
 */
router.post('/test-mode', (req, res) => {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    config.testMode = enabled;
    logger.info(`Test mode ${enabled ? 'enabled' : 'disabled'}`);

    res.json({
        success: true,
        testMode: config.testMode
    });
});

module.exports = router;
