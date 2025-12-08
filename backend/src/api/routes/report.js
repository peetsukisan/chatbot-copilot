/**
 * Report API Routes
 */

const express = require('express');
const router = express.Router();

const { generateDailyReport, getReport, getRecentReports } = require('../../services/reports/dailyReport');
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
 * GET /api/reports
 * Get recent reports
 */
router.get('/', async (req, res) => {
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
 * GET /api/reports/:date
 * Get report for specific date
 */
router.get('/:date', async (req, res) => {
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
 * POST /api/reports/generate
 * Generate report (can be triggered by GitHub Actions)
 */
router.post('/generate', async (req, res) => {
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

module.exports = router;
