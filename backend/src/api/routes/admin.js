/**
 * Admin API Routes
 * Backend administration endpoints
 */

const express = require('express');
const router = express.Router();

const { getCustomers, getCustomerStats, updateCustomer } = require('../../models/customer');
const { getMessageStats, getIntentDistribution, getHourlyDistribution } = require('../../models/chat');
const { getMenuOptions, createMenuOption, updateMenuOption, deleteMenuOption, reorderMenuOptions } = require('../../models/menuOption');
const { analyzeTrends, getDailyStats } = require('../../services/ai/trendAnalyzer');
const { generateDailyReport, getReport, getRecentReports } = require('../../services/reports/dailyReport');
const { getStats: getVectorStats } = require('../../services/vector/pinecone');
const { isBusinessHours, getBusinessStatus } = require('../../utils/businessHours');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

// Simple auth middleware
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || token !== config.admin.apiToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
};

// Apply auth to all admin routes
router.use(authMiddleware);

// ============ Dashboard Overview ============

/**
 * GET /api/admin/dashboard
 * Get dashboard overview data
 */
router.get('/dashboard', async (req, res) => {
    try {
        const [customerStats, messageStats, vectorStats, businessStatus] = await Promise.all([
            getCustomerStats(),
            getMessageStats('7d'),
            getVectorStats(),
            Promise.resolve(getBusinessStatus())
        ]);

        res.json({
            success: true,
            data: {
                customers: customerStats,
                messages: messageStats,
                vectorDB: vectorStats,
                businessHours: businessStatus,
                serverTime: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error(`Dashboard error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ============ Analytics ============

/**
 * GET /api/admin/analytics/trends
 * Get trend analysis
 */
router.get('/analytics/trends', async (req, res) => {
    try {
        const period = req.query.period || '7d';
        const trends = await analyzeTrends(period);

        res.json({
            success: true,
            data: trends
        });
    } catch (error) {
        logger.error(`Trends error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/admin/analytics/intents
 * Get intent distribution
 */
router.get('/analytics/intents', async (req, res) => {
    try {
        const period = req.query.period || '7d';
        const intents = await getIntentDistribution(period);

        res.json({
            success: true,
            data: intents
        });
    } catch (error) {
        logger.error(`Intents error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/admin/analytics/hourly
 * Get hourly message distribution
 */
router.get('/analytics/hourly', async (req, res) => {
    try {
        const period = req.query.period || '7d';
        const hourly = await getHourlyDistribution(period);

        res.json({
            success: true,
            data: hourly
        });
    } catch (error) {
        logger.error(`Hourly error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/admin/analytics/daily
 * Get daily message counts
 */
router.get('/analytics/daily', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const daily = await getDailyStats(days);

        res.json({
            success: true,
            data: daily
        });
    } catch (error) {
        logger.error(`Daily stats error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ============ Menu Options ============

/**
 * GET /api/admin/menu
 * Get all menu options
 */
router.get('/menu', async (req, res) => {
    try {
        const includeDisabled = req.query.all === 'true';
        const options = await getMenuOptions(includeDisabled);

        res.json({
            success: true,
            data: options
        });
    } catch (error) {
        logger.error(`Menu list error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/admin/menu
 * Create new menu option
 */
router.post('/menu', async (req, res) => {
    try {
        const option = await createMenuOption(req.body);

        res.json({
            success: true,
            data: option
        });
    } catch (error) {
        logger.error(`Menu create error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/admin/menu/:id
 * Update menu option
 */
router.put('/menu/:id', async (req, res) => {
    try {
        const option = await updateMenuOption(parseInt(req.params.id), req.body);

        res.json({
            success: true,
            data: option
        });
    } catch (error) {
        logger.error(`Menu update error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/admin/menu/:id
 * Delete menu option
 */
router.delete('/menu/:id', async (req, res) => {
    try {
        await deleteMenuOption(parseInt(req.params.id));

        res.json({
            success: true,
            message: 'Menu option deleted'
        });
    } catch (error) {
        logger.error(`Menu delete error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/admin/menu/reorder
 * Reorder menu options
 */
router.post('/menu/reorder', async (req, res) => {
    try {
        const options = await reorderMenuOptions(req.body.orderedIds);

        res.json({
            success: true,
            data: options
        });
    } catch (error) {
        logger.error(`Menu reorder error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ============ Reports ============

/**
 * GET /api/admin/reports
 * Get recent reports
 */
router.get('/reports', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 7;
        const reports = await getRecentReports(limit);

        res.json({
            success: true,
            data: reports
        });
    } catch (error) {
        logger.error(`Reports list error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/admin/reports/:date
 * Get report by date
 */
router.get('/reports/:date', async (req, res) => {
    try {
        const report = await getReport(req.params.date);

        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        logger.error(`Report get error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/admin/reports/generate
 * Generate report for specific date
 */
router.post('/reports/generate', async (req, res) => {
    try {
        const date = req.body.date ? new Date(req.body.date) : undefined;
        const report = await generateDailyReport(date);

        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        logger.error(`Report generate error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ============ Settings ============

/**
 * GET /api/admin/settings
 * Get current settings
 */
router.get('/settings', (req, res) => {
    res.json({
        success: true,
        data: {
            businessHours: config.businessHours,
            ai: {
                confidenceThreshold: config.ai.confidenceThreshold,
                maxContextMessages: config.ai.maxContextMessages
            },
            wakeup: config.wakeup
        }
    });
});

module.exports = router;
