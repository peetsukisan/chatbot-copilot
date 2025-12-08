/**
 * Customer Model
 * Handles customer data operations
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database');
const logger = require('../utils/logger');

/**
 * Get or create customer by Facebook user ID
 */
async function getOrCreateCustomer(fbUserId) {
    const db = getDatabase();

    // Try to find existing customer
    let customer = db.prepare('SELECT * FROM customers WHERE fb_user_id = ?').get(fbUserId);

    if (customer) {
        // Parse JSON fields
        customer.detectedIntents = customer.detected_intents ? JSON.parse(customer.detected_intents) : [];
        customer.tags = customer.tags ? JSON.parse(customer.tags) : [];
        return customer;
    }

    // Create new customer
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
    INSERT INTO customers (id, fb_user_id, first_contact, last_contact)
    VALUES (?, ?, ?, ?)
  `).run(id, fbUserId, now, now);

    logger.info(`Created new customer: ${fbUserId}`);

    return {
        id,
        fb_user_id: fbUserId,
        name: null,
        profile_pic: null,
        first_contact: now,
        last_contact: now,
        total_conversations: 0,
        detectedIntents: [],
        sentiment_avg: 0,
        notes: null,
        tags: []
    };
}

/**
 * Update customer information
 */
async function updateCustomer(fbUserId, updates) {
    const db = getDatabase();

    const allowedFields = ['name', 'profile_pic', 'notes', 'sentiment_avg'];
    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
    }

    if (updates.tags) {
        setClauses.push('tags = ?');
        values.push(JSON.stringify(updates.tags));
    }

    if (updates.detectedIntents) {
        setClauses.push('detected_intents = ?');
        values.push(JSON.stringify(updates.detectedIntents));
    }

    setClauses.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(fbUserId);

    db.prepare(`
    UPDATE customers SET ${setClauses.join(', ')} WHERE fb_user_id = ?
  `).run(...values);

    return getOrCreateCustomer(fbUserId);
}

/**
 * Update customer activity
 */
async function updateCustomerActivity(fbUserId, activity) {
    const db = getDatabase();

    const updates = {
        last_contact: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    if (activity.lastIntent) {
        // Get current intents and add new one
        const customer = db.prepare('SELECT detected_intents FROM customers WHERE fb_user_id = ?').get(fbUserId);
        const intents = customer?.detected_intents ? JSON.parse(customer.detected_intents) : [];

        if (!intents.includes(activity.lastIntent)) {
            intents.push(activity.lastIntent);
            updates.detected_intents = JSON.stringify(intents);
        }
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`);
    const values = [...Object.values(updates), fbUserId];

    db.prepare(`
    UPDATE customers SET ${setClauses.join(', ')} WHERE fb_user_id = ?
  `).run(...values);

    // Increment conversation count
    db.prepare(`
    UPDATE customers SET total_conversations = total_conversations + 1 
    WHERE fb_user_id = ? AND date(last_contact) != date(?)
  `).run(fbUserId, updates.last_contact);
}

/**
 * Get all customers with pagination
 */
async function getCustomers(options = {}) {
    const db = getDatabase();
    const { limit = 50, offset = 0, search = '', sortBy = 'last_contact', sortOrder = 'DESC' } = options;

    let query = 'SELECT * FROM customers';
    const params = [];

    if (search) {
        query += ' WHERE name LIKE ? OR fb_user_id LIKE ?';
        params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const customers = db.prepare(query).all(...params);

    // Parse JSON fields
    return customers.map(c => ({
        ...c,
        detectedIntents: c.detected_intents ? JSON.parse(c.detected_intents) : [],
        tags: c.tags ? JSON.parse(c.tags) : []
    }));
}

/**
 * Get customers who haven't contacted in specified days
 */
async function getInactiveCustomers(days) {
    const db = getDatabase();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const customers = db.prepare(`
    SELECT * FROM customers 
    WHERE last_contact < ? 
    ORDER BY last_contact ASC
  `).all(cutoff.toISOString());

    return customers.map(c => ({
        ...c,
        detectedIntents: c.detected_intents ? JSON.parse(c.detected_intents) : [],
        tags: c.tags ? JSON.parse(c.tags) : []
    }));
}

/**
 * Add tag to customer
 */
async function addCustomerTag(fbUserId, tag) {
    const db = getDatabase();
    const customer = await getOrCreateCustomer(fbUserId);

    const tags = customer.tags || [];
    if (!tags.includes(tag)) {
        tags.push(tag);
        await updateCustomer(fbUserId, { tags });
    }

    return tags;
}

/**
 * Get customer statistics
 */
async function getCustomerStats() {
    const db = getDatabase();

    const total = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;

    const today = new Date().toISOString().split('T')[0];
    const activeToday = db.prepare(`
    SELECT COUNT(*) as count FROM customers WHERE date(last_contact) = ?
  `).get(today).count;

    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    const activeLast7Days = db.prepare(`
    SELECT COUNT(*) as count FROM customers WHERE last_contact >= ?
  `).get(last7Days.toISOString()).count;

    return {
        total,
        activeToday,
        activeLast7Days
    };
}

module.exports = {
    getOrCreateCustomer,
    updateCustomer,
    updateCustomerActivity,
    getCustomers,
    getInactiveCustomers,
    addCustomerTag,
    getCustomerStats
};
