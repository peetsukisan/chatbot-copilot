/**
 * Facebook Graph API Service
 * Handles fetching chat history and conversations from Facebook
 */

const axios = require('axios');
const { subDays, format } = require('date-fns');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

const GRAPH_API_BASE = `${config.facebook.graphApiUrl}/${config.facebook.apiVersion}`;

/**
 * Get all conversations from the last N days
 * @param {number} days - Number of days to look back (default: 60)
 */
async function getConversations(days = 60) {
    const since = Math.floor(subDays(new Date(), days).getTime() / 1000);

    try {
        const conversations = [];
        let url = `${GRAPH_API_BASE}/me/conversations`;
        let params = {
            access_token: config.facebook.pageAccessToken,
            fields: 'id,updated_time,participants,message_count',
            since
        };

        // Paginate through all conversations
        while (url) {
            const response = await axios.get(url, { params });

            if (response.data.data) {
                conversations.push(...response.data.data);
            }

            // Check for next page
            url = response.data.paging?.next || null;
            params = {}; // Next URL includes all params
        }

        logger.info(`Fetched ${conversations.length} conversations from last ${days} days`);
        return conversations;
    } catch (error) {
        logger.error(`Failed to get conversations: ${error.message}`);
        throw error;
    }
}

/**
 * Get messages from a specific conversation
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Number of messages to fetch
 */
async function getMessages(conversationId, limit = 100) {
    try {
        const messages = [];
        let url = `${GRAPH_API_BASE}/${conversationId}/messages`;
        let params = {
            access_token: config.facebook.pageAccessToken,
            fields: 'id,created_time,from,message',
            limit: Math.min(limit, 100)
        };

        let fetched = 0;
        while (url && fetched < limit) {
            const response = await axios.get(url, { params });

            if (response.data.data) {
                messages.push(...response.data.data);
                fetched += response.data.data.length;
            }

            url = response.data.paging?.next || null;
            params = {};
        }

        logger.debug(`Fetched ${messages.length} messages from conversation ${conversationId}`);
        return messages;
    } catch (error) {
        logger.error(`Failed to get messages: ${error.message}`);
        throw error;
    }
}

/**
 * Get participant info from a conversation
 * @param {string} conversationId - Conversation ID
 */
async function getParticipants(conversationId) {
    try {
        const response = await axios.get(
            `${GRAPH_API_BASE}/${conversationId}`,
            {
                params: {
                    access_token: config.facebook.pageAccessToken,
                    fields: 'participants'
                }
            }
        );

        return response.data.participants?.data || [];
    } catch (error) {
        logger.error(`Failed to get participants: ${error.message}`);
        return [];
    }
}

/**
 * Sync all chat history from the last 60 days
 * Returns structured data ready for embedding
 */
async function syncAllChats() {
    const conversations = await getConversations(60);
    const chatData = [];

    for (const conv of conversations) {
        try {
            const messages = await getMessages(conv.id);
            const participants = await getParticipants(conv.id);

            // Find customer (non-page participant)
            const customer = participants.find(p => p.id !== config.facebook.pageId);

            if (messages.length > 0) {
                chatData.push({
                    conversationId: conv.id,
                    customerId: customer?.id,
                    customerName: customer?.name,
                    updatedTime: conv.updated_time,
                    messageCount: messages.length,
                    messages: messages.map(m => ({
                        id: m.id,
                        text: m.message,
                        from: m.from.id === customer?.id ? 'customer' : 'staff',
                        createdTime: m.created_time
                    }))
                });
            }

            // Rate limiting - wait between requests
            await sleep(100);
        } catch (error) {
            logger.error(`Failed to sync conversation ${conv.id}: ${error.message}`);
            continue;
        }
    }

    logger.info(`Synced ${chatData.length} conversations with ${chatData.reduce((sum, c) => sum + c.messageCount, 0)} total messages`);
    return chatData;
}

/**
 * Format conversations for training/embedding
 * Groups customer-staff exchanges into Q&A pairs
 */
function formatForTraining(chatData) {
    const trainingPairs = [];

    for (const conv of chatData) {
        const messages = conv.messages.sort((a, b) =>
            new Date(a.createdTime) - new Date(b.createdTime)
        );

        let currentQuestion = null;

        for (const msg of messages) {
            if (msg.from === 'customer') {
                currentQuestion = msg.text;
            } else if (msg.from === 'staff' && currentQuestion) {
                trainingPairs.push({
                    conversationId: conv.conversationId,
                    customerId: conv.customerId,
                    question: currentQuestion,
                    answer: msg.text,
                    timestamp: msg.createdTime
                });
                currentQuestion = null; // Reset for next pair
            }
        }
    }

    logger.info(`Created ${trainingPairs.length} Q&A training pairs`);
    return trainingPairs;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    getConversations,
    getMessages,
    getParticipants,
    syncAllChats,
    formatForTraining
};
