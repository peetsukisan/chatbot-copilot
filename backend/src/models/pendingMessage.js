/**
 * Pending Messages Model
 * Stores messages that are queued but not yet sent (Test Mode)
 */

const { getDatabase } = require('./database');
const { v4: uuidv4 } = require('uuid');

/**
 * Save a pending message (for test mode)
 */
function savePendingMessage(recipientId, message, source, metadata = {}) {
    const db = getDatabase();
    const id = uuidv4();

    db.prepare(`
        INSERT INTO pending_messages (id, recipient_id, message, source, metadata, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(id, recipientId, message, source, JSON.stringify(metadata));

    return { id, recipientId, message, source, status: 'pending' };
}

/**
 * Get all pending messages
 */
function getPendingMessages(status = 'pending') {
    const db = getDatabase();

    return db.prepare(`
        SELECT pm.*, c.name as customer_name
        FROM pending_messages pm
        LEFT JOIN customers c ON pm.recipient_id = c.fb_user_id
        WHERE pm.status = ?
        ORDER BY pm.created_at DESC
        LIMIT 100
    `).all(status);
}

/**
 * Approve a pending message (mark as ready to send)
 */
function approvePendingMessage(id) {
    const db = getDatabase();

    db.prepare(`
        UPDATE pending_messages 
        SET status = 'approved', approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(id);

    return getPendingMessageById(id);
}

/**
 * Reject/delete a pending message
 */
function rejectPendingMessage(id) {
    const db = getDatabase();

    db.prepare(`
        UPDATE pending_messages 
        SET status = 'rejected'
        WHERE id = ?
    `).run(id);

    return true;
}

/**
 * Mark message as sent
 */
function markMessageSent(id) {
    const db = getDatabase();

    db.prepare(`
        UPDATE pending_messages 
        SET status = 'sent', sent_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(id);

    return true;
}

/**
 * Get a pending message by ID
 */
function getPendingMessageById(id) {
    const db = getDatabase();

    return db.prepare(`
        SELECT * FROM pending_messages WHERE id = ?
    `).get(id);
}

/**
 * Get approved messages ready to send
 */
function getApprovedMessages() {
    const db = getDatabase();

    return db.prepare(`
        SELECT * FROM pending_messages 
        WHERE status = 'approved'
        ORDER BY created_at ASC
    `).all();
}

/**
 * Clear old pending messages (older than 7 days)
 */
function clearOldPendingMessages() {
    const db = getDatabase();

    db.prepare(`
        DELETE FROM pending_messages 
        WHERE created_at < datetime('now', '-7 days')
        AND status IN ('sent', 'rejected')
    `).run();
}

/**
 * Get pending messages stats
 */
function getPendingStats() {
    const db = getDatabase();

    const stats = db.prepare(`
        SELECT 
            status,
            COUNT(*) as count
        FROM pending_messages
        GROUP BY status
    `).all();

    const result = { pending: 0, approved: 0, sent: 0, rejected: 0 };
    stats.forEach(s => {
        result[s.status] = s.count;
    });

    return result;
}

module.exports = {
    savePendingMessage,
    getPendingMessages,
    approvePendingMessage,
    rejectPendingMessage,
    markMessageSent,
    getPendingMessageById,
    getApprovedMessages,
    clearOldPendingMessages,
    getPendingStats
};
