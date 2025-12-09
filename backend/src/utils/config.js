/**
 * Configuration utility
 * Centralizes all environment variables and defaults
 */

const config = {
    // Server
    port: parseInt(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // Learning Mode - When enabled, system ONLY collects data, no customer responses
    // Set to false when ready to start responding to customers
    learningMode: process.env.LEARNING_MODE !== 'false', // Default: ON (true)

    // Test Mode - When enabled, messages are queued but not sent
    testMode: process.env.TEST_MODE === 'true' || true, // Default to test mode ON

    // Facebook
    facebook: {
        pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN,
        verifyToken: process.env.FB_VERIFY_TOKEN || 'chatbot_verify_token',
        appSecret: process.env.FB_APP_SECRET,
        apiVersion: 'v18.0',
        graphApiUrl: 'https://graph.facebook.com'
    },

    // Gemini AI - Multiple keys for rate limit handling (up to 8)
    gemini: {
        apiKeys: [
            process.env.GEMINI_API_KEY_1,
            process.env.GEMINI_API_KEY_2,
            process.env.GEMINI_API_KEY_3,
            process.env.GEMINI_API_KEY_4,
            process.env.GEMINI_API_KEY_5,
            process.env.GEMINI_API_KEY_6,
            process.env.GEMINI_API_KEY_7,
            process.env.GEMINI_API_KEY_8
        ].filter(Boolean),
        currentKeyIndex: 0,
        model: 'gemini-2.0-flash-lite',
        embeddingModel: 'text-embedding-004'
    },

    // Admin
    admin: {
        apiToken: process.env.ADMIN_API_TOKEN,
        corsOrigin: process.env.ADMIN_CORS_ORIGIN || '*'
    },

    // Business Hours
    businessHours: {
        start: process.env.BUSINESS_HOURS_START || '10:00',
        end: process.env.BUSINESS_HOURS_END || '22:00',
        timezone: process.env.TIMEZONE || 'Asia/Bangkok'
    },

    // AI Settings
    ai: {
        confidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.7,
        maxContextMessages: parseInt(process.env.AI_MAX_CONTEXT_MESSAGES) || 5
    },

    // Wake-up Campaign
    wakeup: {
        inactiveDays: parseInt(process.env.WAKEUP_INACTIVE_DAYS) || 30
    },

    // Pinecone Vector Database (Cloud - Free 100K vectors)
    pinecone: {
        apiKey: process.env.PINECONE_API_KEY,
        indexName: process.env.PINECONE_INDEX_NAME || 'chatbot-copilot'
    },

    // Database paths
    database: {
        sqlitePath: process.env.SQLITE_PATH || './data/chatbot.db'
    }
};

/**
 * Get next Gemini API key (rotate on rate limit)
 */
config.gemini.getNextKey = function () {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return this.apiKeys[this.currentKeyIndex];
};

/**
 * Get current Gemini API key
 */
config.gemini.getCurrentKey = function () {
    return this.apiKeys[this.currentKeyIndex];
};

module.exports = config;
