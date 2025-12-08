/**
 * Customer API Routes
 */

const express = require('express');
const router = express.Router();

const { getCustomers, getOrCreateCustomer, updateCustomer, addCustomerTag, getInactiveCustomers } = require('../../models/customer');
const { getRecentMessages } = require('../../models/chat');
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
 * GET /api/customers
 * List customers with pagination
 */
router.get('/', async (req, res) => {
    try {
        const options = {
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0,
            search: req.query.search || '',
            sortBy: req.query.sortBy || 'last_contact',
            sortOrder: req.query.sortOrder || 'DESC'
        };

        const customers = await getCustomers(options);

        res.json({
            success: true,
            data: customers,
            pagination: {
                limit: options.limit,
                offset: options.offset
            }
        });
    } catch (error) {
        logger.error(`Customer list error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/customers/inactive
 * Get inactive customers
 */
router.get('/inactive', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || config.wakeup.inactiveDays;
        const customers = await getInactiveCustomers(days);

        res.json({
            success: true,
            data: customers,
            inactiveDays: days
        });
    } catch (error) {
        logger.error(`Inactive customers error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/customers/:id
 * Get single customer
 */
router.get('/:id', async (req, res) => {
    try {
        const customer = await getOrCreateCustomer(req.params.id);
        const recentMessages = await getRecentMessages(req.params.id, 20);

        res.json({
            success: true,
            data: {
                ...customer,
                recentMessages
            }
        });
    } catch (error) {
        logger.error(`Customer get error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/customers/:id
 * Update customer
 */
router.put('/:id', async (req, res) => {
    try {
        const customer = await updateCustomer(req.params.id, req.body);

        res.json({
            success: true,
            data: customer
        });
    } catch (error) {
        logger.error(`Customer update error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/customers/:id/tags
 * Add tag to customer
 */
router.post('/:id/tags', async (req, res) => {
    try {
        const tags = await addCustomerTag(req.params.id, req.body.tag);

        res.json({
            success: true,
            data: { tags }
        });
    } catch (error) {
        logger.error(`Customer tag error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
