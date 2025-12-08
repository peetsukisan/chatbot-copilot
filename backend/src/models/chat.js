/**
 * Chat/Message Model
 * Handles chat message operations
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database');
const logger = require('../utils/logger');

/**
 * Save a message
 */
async function saveMessage(messageData) {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
    INSERT INTO messages (
      id, sender_id, text, sender, staff_id, intent, intent_confidence,
      confidence, escalated, escalation_reason, response_time_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    stmt.run(
        id,
        messageData.senderId,
        messageData.text,
        messageData.sender,
        messageData.staffId || null,
        messageData.intent || null,
        messageData.intentConfidence || null,
        messageData.confidence || null,
        messageData.escalated ? 1 : 0,
        messageData.escalationReason || null,
        messageData.responseTimeMs || null,
        now
    );

    logger.debug(`Saved message ${id} from ${messageData.sender}`);
    return { id, ...messageData, created_at: now };
}

/**
 * Get recent messages for a customer
 */
async function getRecentMessages(senderId, limit = 10) {
    const db = getDatabase();

    const messages = db.prepare(`
    SELECT * FROM messages 
    WHERE sender_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(senderId, limit);

    return messages.reverse(); // Chronological order
}

/**
 * Get all messages with pagination
 */
async function getMessages(options = {}) {
    const db = getDatabase();
    const { limit = 50, offset = 0, senderId, sender, intent, since } = options;

    let query = 'SELECT * FROM messages WHERE 1=1';
    const params = [];

    if (senderId) {
        query += ' AND sender_id = ?';
        params.push(senderId);
    }

    if (sender) {
        query += ' AND sender = ?';
        params.push(sender);
    }

    if (intent) {
        query += ' AND intent = ?';
        params.push(intent);
    }

    if (since) {
        query += ' AND created_at >= ?';
        params.push(since);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params);
}

/**
 * Get messages for embedding (not yet embedded)
 */
async function getMessagesForEmbedding(limit = 100) {
    const db = getDatabase();

    // Get Q&A pairs (customer message followed by AI/staff response)
    const pairs = db.prepare(`
    SELECT 
      m1.id as question_id,
      m1.text as question,
      m1.sender_id,
      m1.created_at as question_time,
      m2.id as answer_id,
      m2.text as answer,
      m2.sender as answerer,
      m2.created_at as answer_time
    FROM messages m1
    JOIN messages m2 ON m1.sender_id = m2.sender_id 
      AND m2.created_at > m1.created_at
      AND m2.sender IN ('ai', 'staff')
    WHERE m1.sender = 'customer'
      AND NOT EXISTS (
        SELECT 1 FROM messages m3 
        WHERE m3.sender_id = m1.sender_id 
          AND m3.created_at > m1.created_at 
          AND m3.created_at < m2.created_at
      )
    ORDER BY m1.created_at DESC
    LIMIT ?
  `).all(limit);

    return pairs;
}

/**
 * Get message statistics
 */
async function getMessageStats(period = '7d') {
    const db = getDatabase();
    const days = parseInt(period) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN sender = 'customer' THEN 1 ELSE 0 END) as fromCustomer,
      SUM(CASE WHEN sender = 'ai' THEN 1 ELSE 0 END) as fromAI,
      SUM(CASE WHEN sender = 'staff' THEN 1 ELSE 0 END) as fromStaff,
      AVG(CASE WHEN sender = 'ai' THEN confidence ELSE NULL END) as avgAIConfidence,
      SUM(CASE WHEN escalated = 1 THEN 1 ELSE 0 END) as escalated
    FROM messages
    WHERE created_at >= ?
  `).get(since.toISOString());

    return {
        period,
        total: stats.total || 0,
        fromCustomer: stats.fromCustomer || 0,
        fromAI: stats.fromAI || 0,
        fromStaff: stats.fromStaff || 0,
        avgAIConfidence: stats.avgAIConfidence ? Math.round(stats.avgAIConfidence * 100) : 0,
        escalated: stats.escalated || 0
    };
}

/**
 * Get intent distribution
 */
async function getIntentDistribution(period = '7d') {
    const db = getDatabase();
    const days = parseInt(period) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    return db.prepare(`
    SELECT intent, COUNT(*) as count
    FROM messages
    WHERE created_at >= ? AND intent IS NOT NULL
    GROUP BY intent
    ORDER BY count DESC
  `).all(since.toISOString());
}

/**
 * Get hourly message distribution
 */
async function getHourlyDistribution(period = '7d') {
    const db = getDatabase();
    const days = parseInt(period) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    return db.prepare(`
    SELECT 
      strftime('%H', created_at) as hour,
      COUNT(*) as count
    FROM messages
    WHERE created_at >= ?
    GROUP BY hour
    ORDER BY hour
  `).all(since.toISOString());
}

module.exports = {
    saveMessage,
    getRecentMessages,
    getMessages,
    getMessagesForEmbedding,
    getMessageStats,
    getIntentDistribution,
    getHourlyDistribution
};
