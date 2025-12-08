/**
 * Menu Option Model
 * Handles menu option CRUD operations
 */

const { getDatabase } = require('./database');
const logger = require('../utils/logger');

/**
 * Get all menu options
 */
async function getMenuOptions(includeDisabled = false) {
    const db = getDatabase();

    let query = 'SELECT * FROM menu_options';
    if (!includeDisabled) {
        query += ' WHERE enabled = 1';
    }
    query += ' ORDER BY order_num ASC';

    const options = db.prepare(query).all();

    return options.map(opt => ({
        ...opt,
        keywords: opt.keywords ? opt.keywords.split(',').map(k => k.trim()) : []
    }));
}

/**
 * Get single menu option
 */
async function getMenuOption(id) {
    const db = getDatabase();
    const opt = db.prepare('SELECT * FROM menu_options WHERE id = ?').get(id);

    if (opt) {
        opt.keywords = opt.keywords ? opt.keywords.split(',').map(k => k.trim()) : [];
    }

    return opt;
}

/**
 * Create menu option
 */
async function createMenuOption(data) {
    const db = getDatabase();

    // Get max order
    const maxOrder = db.prepare('SELECT MAX(order_num) as max FROM menu_options').get().max || 0;

    const stmt = db.prepare(`
    INSERT INTO menu_options (order_num, emoji, text, keywords, auto_response, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

    const result = stmt.run(
        data.order || maxOrder + 1,
        data.emoji || '📌',
        data.text,
        Array.isArray(data.keywords) ? data.keywords.join(',') : data.keywords || '',
        data.autoResponse || '',
        data.enabled !== false ? 1 : 0
    );

    logger.info(`Created menu option: ${data.text}`);
    return getMenuOption(result.lastInsertRowid);
}

/**
 * Update menu option
 */
async function updateMenuOption(id, data) {
    const db = getDatabase();

    const updates = [];
    const values = [];

    if (data.order !== undefined) {
        updates.push('order_num = ?');
        values.push(data.order);
    }

    if (data.emoji !== undefined) {
        updates.push('emoji = ?');
        values.push(data.emoji);
    }

    if (data.text !== undefined) {
        updates.push('text = ?');
        values.push(data.text);
    }

    if (data.keywords !== undefined) {
        updates.push('keywords = ?');
        values.push(Array.isArray(data.keywords) ? data.keywords.join(',') : data.keywords);
    }

    if (data.autoResponse !== undefined) {
        updates.push('auto_response = ?');
        values.push(data.autoResponse);
    }

    if (data.enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(data.enabled ? 1 : 0);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE menu_options SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logger.info(`Updated menu option: ${id}`);
    return getMenuOption(id);
}

/**
 * Delete menu option
 */
async function deleteMenuOption(id) {
    const db = getDatabase();
    db.prepare('DELETE FROM menu_options WHERE id = ?').run(id);
    logger.info(`Deleted menu option: ${id}`);
    return true;
}

/**
 * Reorder menu options
 */
async function reorderMenuOptions(orderedIds) {
    const db = getDatabase();

    const stmt = db.prepare('UPDATE menu_options SET order_num = ? WHERE id = ?');

    for (let i = 0; i < orderedIds.length; i++) {
        stmt.run(i + 1, orderedIds[i]);
    }

    logger.info('Menu options reordered');
    return getMenuOptions(true);
}

/**
 * Find menu option by keyword match
 */
async function findMenuByKeyword(text) {
    const options = await getMenuOptions();
    const textLower = text.toLowerCase();

    for (const opt of options) {
        for (const keyword of opt.keywords) {
            if (textLower.includes(keyword.toLowerCase())) {
                return opt;
            }
        }
    }

    return null;
}

module.exports = {
    getMenuOptions,
    getMenuOption,
    createMenuOption,
    updateMenuOption,
    deleteMenuOption,
    reorderMenuOptions,
    findMenuByKeyword
};
