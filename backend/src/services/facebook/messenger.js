/**
 * Facebook Messenger Service
 * Handles sending messages to Facebook Messenger
 */

const axios = require('axios');
const config = require('../../utils/config');
const logger = require('../../utils/logger');
const { savePendingMessage } = require('../../models/pendingMessage');

const GRAPH_API_URL = `${config.facebook.graphApiUrl}/${config.facebook.apiVersion}/me/messages`;

/**
 * Send a text message
 * @param {string} recipientId - Facebook user ID
 * @param {string} text - Message text
 * @param {string} source - Source of message (ai, staff, campaign, wakeup)
 * @param {object} metadata - Additional metadata
 */
async function sendMessage(recipientId, text, source = 'ai', metadata = {}) {
    // Check test mode - queue message instead of sending
    if (config.testMode) {
        logger.info(`[TEST MODE] Message queued for ${recipientId}: ${text.substring(0, 50)}...`);
        const pending = savePendingMessage(recipientId, text, source, metadata);
        return { testMode: true, pending };
    }

    // Production mode - actually send
    try {
        const response = await axios.post(
            GRAPH_API_URL,
            {
                recipient: { id: recipientId },
                message: { text }
            },
            {
                params: { access_token: config.facebook.pageAccessToken }
            }
        );

        logger.debug(`Message sent to ${recipientId}: ${text.substring(0, 50)}...`);
        return response.data;
    } catch (error) {
        logger.error(`Failed to send message: ${error.message}`);
        throw error;
    }
}

/**
 * Force send a message (bypasses test mode)
 * Used when approving messages from pending queue
 */
async function forceSendMessage(recipientId, text) {
    try {
        const response = await axios.post(
            GRAPH_API_URL,
            {
                recipient: { id: recipientId },
                message: { text }
            },
            {
                params: { access_token: config.facebook.pageAccessToken }
            }
        );

        logger.debug(`Message force-sent to ${recipientId}: ${text.substring(0, 50)}...`);
        return response.data;
    } catch (error) {
        logger.error(`Failed to force send message: ${error.message}`);
        throw error;
    }
}

/**
 * Send quick replies
 * @param {string} recipientId - Facebook user ID
 * @param {string} text - Message text
 * @param {Array} quickReplies - Array of quick reply objects
 */
async function sendQuickReplies(recipientId, text, quickReplies) {
    try {
        const response = await axios.post(
            GRAPH_API_URL,
            {
                recipient: { id: recipientId },
                message: {
                    text,
                    quick_replies: quickReplies.slice(0, 13) // FB limit is 13
                }
            },
            {
                params: { access_token: config.facebook.pageAccessToken }
            }
        );

        logger.debug(`Quick replies sent to ${recipientId}`);
        return response.data;
    } catch (error) {
        logger.error(`Failed to send quick replies: ${error.message}`);
        throw error;
    }
}

/**
 * Send button template
 * @param {string} recipientId - Facebook user ID
 * @param {string} text - Message text
 * @param {Array} buttons - Array of button objects
 */
async function sendButtonTemplate(recipientId, text, buttons) {
    try {
        const response = await axios.post(
            GRAPH_API_URL,
            {
                recipient: { id: recipientId },
                message: {
                    attachment: {
                        type: 'template',
                        payload: {
                            template_type: 'button',
                            text,
                            buttons: buttons.slice(0, 3) // FB limit is 3
                        }
                    }
                }
            },
            {
                params: { access_token: config.facebook.pageAccessToken }
            }
        );

        logger.debug(`Button template sent to ${recipientId}`);
        return response.data;
    } catch (error) {
        logger.error(`Failed to send button template: ${error.message}`);
        throw error;
    }
}

/**
 * Send typing indicator
 * @param {string} recipientId - Facebook user ID
 * @param {boolean} on - Turn typing on or off
 */
async function sendTypingIndicator(recipientId, on = true) {
    try {
        await axios.post(
            GRAPH_API_URL,
            {
                recipient: { id: recipientId },
                sender_action: on ? 'typing_on' : 'typing_off'
            },
            {
                params: { access_token: config.facebook.pageAccessToken }
            }
        );
    } catch (error) {
        logger.error(`Failed to send typing indicator: ${error.message}`);
    }
}

/**
 * Get user profile
 * @param {string} userId - Facebook user ID
 */
async function getUserProfile(userId) {
    try {
        const response = await axios.get(
            `${config.facebook.graphApiUrl}/${userId}`,
            {
                params: {
                    fields: 'first_name,last_name,profile_pic',
                    access_token: config.facebook.pageAccessToken
                }
            }
        );

        return response.data;
    } catch (error) {
        logger.error(`Failed to get user profile: ${error.message}`);
        return null;
    }
}

/**
 * Mark message as seen
 * @param {string} recipientId - Facebook user ID
 */
async function markSeen(recipientId) {
    try {
        await axios.post(
            GRAPH_API_URL,
            {
                recipient: { id: recipientId },
                sender_action: 'mark_seen'
            },
            {
                params: { access_token: config.facebook.pageAccessToken }
            }
        );
    } catch (error) {
        logger.error(`Failed to mark seen: ${error.message}`);
    }
}

module.exports = {
    sendMessage,
    forceSendMessage,
    sendQuickReplies,
    sendButtonTemplate,
    sendTypingIndicator,
    getUserProfile,
    markSeen
};
