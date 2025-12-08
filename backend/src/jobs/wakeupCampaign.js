/**
 * Wake-up Campaign Job
 * Sends promotional messages to inactive customers
 */

const { getInactiveCustomers } = require('../models/customer');
const { getBestPromotionForWakeup, markPromotionUsed, savePromotion } = require('../models/promotion');
const { getBestPromotions, generateWakeupMessage, fetchPagePosts, findPromotionPosts } = require('../services/facebook/posts');
const { sendMessage } = require('../services/facebook/messenger');
const config = require('../utils/config');
const logger = require('../utils/logger');

/**
 * Run wake-up campaign
 * 1. Sync latest promotions from Facebook
 * 2. Find inactive customers
 * 3. Send promotional messages
 */
async function runWakeupCampaign(io) {
    logger.info('Starting wake-up campaign...');

    try {
        // Step 1: Sync promotions from Facebook Page
        await syncPromotions();

        // Step 2: Get inactive customers
        const inactiveDays = config.wakeup.inactiveDays || 30;
        const inactiveCustomers = getInactiveCustomers(inactiveDays);

        if (inactiveCustomers.length === 0) {
            logger.info('No inactive customers found');
            return { sent: 0, skipped: 0 };
        }

        logger.info(`Found ${inactiveCustomers.length} inactive customers`);

        // Step 3: Get best promotion
        const promotion = getBestPromotionForWakeup();

        if (!promotion) {
            logger.warn('No promotions available for wake-up campaign');
            return { sent: 0, skipped: 0, error: 'No promotions' };
        }

        // Step 4: Send messages
        let sent = 0;
        let skipped = 0;

        for (const customer of inactiveCustomers) {
            try {
                // Generate personalized message
                const message = generateWakeupMessage(promotion, customer);

                // Send via Messenger
                await sendMessage(customer.fb_user_id, message);

                // Log the send
                markPromotionUsed(promotion.fb_post_id, customer.id);

                sent++;
                logger.info(`Wake-up message sent to ${customer.name || customer.fb_user_id}`);

                // Rate limiting - wait between messages
                await sleep(1000);

            } catch (error) {
                logger.error(`Failed to send wake-up to ${customer.fb_user_id}: ${error.message}`);
                skipped++;
            }
        }

        // Emit to admin dashboard
        if (io) {
            io.to('admin-room').emit('wakeup-campaign-completed', {
                sent,
                skipped,
                promotion: promotion.short_message,
                timestamp: new Date().toISOString()
            });
        }

        logger.info(`Wake-up campaign completed: ${sent} sent, ${skipped} skipped`);
        return { sent, skipped };

    } catch (error) {
        logger.error(`Wake-up campaign failed: ${error.message}`);
        return { sent: 0, skipped: 0, error: error.message };
    }
}

/**
 * Sync promotions from Facebook Page
 */
async function syncPromotions() {
    logger.info('Syncing promotions from Facebook Page...');

    try {
        // Fetch posts from last 60 days
        const posts = await fetchPagePosts(60);

        if (posts.length === 0) {
            logger.info('No posts found');
            return 0;
        }

        // Find promotion posts
        const promotions = findPromotionPosts(posts);
        logger.info(`Found ${promotions.length} promotion posts`);

        // Save to database
        let saved = 0;
        for (const promo of promotions) {
            const result = savePromotion({
                id: promo.id,
                message: promo.message,
                shortMessage: promo.message.substring(0, 100) + (promo.message.length > 100 ? '...' : ''),
                imageUrl: promo.imageUrl,
                link: promo.link,
                engagement: promo.engagement,
                score: promo.promotionScore,
                createdTime: promo.createdTime
            });

            if (result) saved++;
        }

        logger.info(`Saved ${saved} promotions to database`);
        return saved;

    } catch (error) {
        logger.error(`Failed to sync promotions: ${error.message}`);
        return 0;
    }
}

/**
 * Get promotion suggestions for admin dashboard
 */
async function getPromotionSuggestions() {
    try {
        const promotions = await getBestPromotions(5);
        return promotions.map(p => ({
            id: p.id,
            message: p.shortMessage,
            image: p.imageUrl,
            link: p.link,
            score: p.score,
            engagement: p.engagement
        }));
    } catch (error) {
        logger.error(`Failed to get promotion suggestions: ${error.message}`);
        return [];
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    runWakeupCampaign,
    syncPromotions,
    getPromotionSuggestions
};
