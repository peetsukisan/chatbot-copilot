/**
 * Promotion Model
 * Stores Facebook Page promotions for wake-up campaigns
 */

const { getDatabase } = require('./database');
const logger = require('../utils/logger');

/**
 * Save promotion to database
 */
function savePromotion(promotion) {
    const db = getDatabase();

    try {
        const stmt = db.prepare(`
      INSERT OR REPLACE INTO promotions (
        fb_post_id, message, short_message, image_url, link,
        engagement_score, promotion_score, expires_at,
        created_at, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(
            promotion.id,
            promotion.message,
            promotion.shortMessage,
            promotion.imageUrl,
            promotion.link,
            promotion.engagement,
            promotion.score,
            promotion.expiresAt || null,
            promotion.createdTime,
            new Date().toISOString()
        );

        logger.debug(`Saved promotion: ${promotion.id}`);
        return true;
    } catch (error) {
        logger.error(`Failed to save promotion: ${error.message}`);
        return false;
    }
}

/**
 * Get active promotions (not expired)
 */
function getActivePromotions(limit = 10) {
    const db = getDatabase();

    try {
        const stmt = db.prepare(`
      SELECT * FROM promotions 
      WHERE (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY promotion_score DESC
      LIMIT ?
    `);

        return stmt.all(limit);
    } catch (error) {
        logger.error(`Failed to get promotions: ${error.message}`);
        return [];
    }
}

/**
 * Get best promotion for wake-up
 */
function getBestPromotionForWakeup() {
    const db = getDatabase();

    try {
        const stmt = db.prepare(`
      SELECT * FROM promotions 
      WHERE (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY promotion_score DESC
      LIMIT 1
    `);

        return stmt.get();
    } catch (error) {
        logger.error(`Failed to get best promotion: ${error.message}`);
        return null;
    }
}

/**
 * Get promotions used in recent wake-up campaigns
 */
function getRecentlyUsedPromotions(days = 7) {
    const db = getDatabase();

    try {
        const stmt = db.prepare(`
      SELECT DISTINCT p.* FROM promotions p
      INNER JOIN wakeup_logs w ON p.fb_post_id = w.promotion_id
      WHERE w.sent_at > datetime('now', '-' || ? || ' days')
    `);

        return stmt.all(days);
    } catch (error) {
        logger.error(`Failed to get recent promotions: ${error.message}`);
        return [];
    }
}

/**
 * Mark promotion as used for wake-up
 */
function markPromotionUsed(promotionId, customerId) {
    const db = getDatabase();

    try {
        const stmt = db.prepare(`
      INSERT INTO wakeup_logs (customer_id, promotion_id, sent_at)
      VALUES (?, ?, datetime('now'))
    `);

        stmt.run(customerId, promotionId);
        return true;
    } catch (error) {
        logger.error(`Failed to mark promotion used: ${error.message}`);
        return false;
    }
}

/**
 * Delete old promotions (older than N days)
 */
function deleteOldPromotions(days = 90) {
    const db = getDatabase();

    try {
        const stmt = db.prepare(`
      DELETE FROM promotions 
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `);

        const result = stmt.run(days);
        logger.info(`Deleted ${result.changes} old promotions`);
        return result.changes;
    } catch (error) {
        logger.error(`Failed to delete old promotions: ${error.message}`);
        return 0;
    }
}

/**
 * Get promotion statistics
 */
function getPromotionStats() {
    const db = getDatabase();

    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM promotions').get();
        const active = db.prepare(`
      SELECT COUNT(*) as count FROM promotions 
      WHERE (expires_at IS NULL OR expires_at > datetime('now'))
    `).get();
        const usedCount = db.prepare(`
      SELECT COUNT(DISTINCT promotion_id) as count FROM wakeup_logs
      WHERE sent_at > datetime('now', '-30 days')
    `).get();

        return {
            total: total.count,
            active: active.count,
            usedLast30Days: usedCount.count
        };
    } catch (error) {
        logger.error(`Failed to get promotion stats: ${error.message}`);
        return { total: 0, active: 0, usedLast30Days: 0 };
    }
}

module.exports = {
    savePromotion,
    getActivePromotions,
    getBestPromotionForWakeup,
    getRecentlyUsedPromotions,
    markPromotionUsed,
    deleteOldPromotions,
    getPromotionStats
};
