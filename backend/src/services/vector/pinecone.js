/**
 * Pinecone Vector Database Service
 * Cloud-hosted vector database - data persists across restarts
 * Free tier: 100,000 vectors
 */

const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

let pinecone = null;
let index = null;
let genAI = null;

const INDEX_NAME = 'chatbot-copilot';
const NAMESPACE = 'chat-history';

/**
 * Initialize Pinecone client
 */
async function initVectorDB() {
    try {
        // Initialize Pinecone
        pinecone = new Pinecone({
            apiKey: config.pinecone.apiKey
        });

        // Get index
        index = pinecone.index(config.pinecone.indexName || INDEX_NAME);

        // Initialize Gemini for embeddings
        genAI = new GoogleGenerativeAI(config.gemini.getCurrentKey());

        logger.info('Pinecone initialized successfully');

        // Get stats
        const stats = await index.describeIndexStats();
        logger.info(`Pinecone index has ${stats.totalRecordCount || 0} vectors`);

        return index;
    } catch (error) {
        logger.error(`Failed to initialize Pinecone: ${error.message}`);
        throw error;
    }
}

/**
 * Generate embedding using Gemini
 */
async function generateEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: config.gemini.embeddingModel });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        logger.error(`Embedding generation failed: ${error.message}`);
        // Return zero vector as fallback (768 dimensions for Gemini)
        return new Array(768).fill(0);
    }
}

/**
 * Add documents to Pinecone
 * @param {Array} documents - Array of Q&A pairs
 */
async function addDocuments(documents) {
    if (!index) await initVectorDB();

    const vectors = [];

    for (const doc of documents) {
        const id = `${doc.conversationId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const text = `คำถาม: ${doc.question}\nคำตอบ: ${doc.answer}`;
        const embedding = await generateEmbedding(text);

        vectors.push({
            id,
            values: embedding,
            metadata: {
                conversationId: doc.conversationId || '',
                customerId: doc.customerId || '',
                question: doc.question,
                answer: doc.answer,
                timestamp: doc.timestamp || new Date().toISOString()
            }
        });

        // Rate limiting - small delay between embeddings
        await sleep(100);
    }

    try {
        // Upsert in batches of 100
        const batchSize = 100;
        for (let i = 0; i < vectors.length; i += batchSize) {
            const batch = vectors.slice(i, i + batchSize);
            await index.namespace(NAMESPACE).upsert(batch);
        }

        logger.info(`Added ${documents.length} documents to Pinecone`);
        return vectors.map(v => v.id);
    } catch (error) {
        logger.error(`Failed to add documents: ${error.message}`);
        throw error;
    }
}

/**
 * Query relevant documents based on user message
 * @param {string} query - User's message
 * @param {number} topK - Number of results to return
 */
async function queryRelevant(query, topK = 5) {
    if (!index) await initVectorDB();

    try {
        // Generate query embedding
        const queryEmbedding = await generateEmbedding(query);

        // Query Pinecone
        const results = await index.namespace(NAMESPACE).query({
            vector: queryEmbedding,
            topK,
            includeMetadata: true
        });

        if (!results.matches || results.matches.length === 0) {
            return [];
        }

        // Format results
        const relevantDocs = results.matches.map(match => ({
            question: match.metadata.question,
            answer: match.metadata.answer,
            conversationId: match.metadata.conversationId,
            customerId: match.metadata.customerId,
            timestamp: match.metadata.timestamp,
            score: match.score
        }));

        logger.debug(`Found ${relevantDocs.length} relevant documents for query`);
        return relevantDocs;
    } catch (error) {
        logger.error(`Failed to query Pinecone: ${error.message}`);
        return [];
    }
}

/**
 * Delete old documents (older than specified days)
 * @param {number} days - Delete documents older than this
 */
async function deleteOldDocuments(days = 60) {
    if (!index) await initVectorDB();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.toISOString();

    try {
        // Pinecone doesn't support delete by metadata directly in free tier
        // We need to query old documents first, then delete by ID
        // For now, log a warning - in production, implement proper cleanup
        logger.warn(`Delete old documents: Manual cleanup needed for documents before ${cutoffTimestamp}`);
        return 0;
    } catch (error) {
        logger.error(`Failed to delete old documents: ${error.message}`);
        return 0;
    }
}

/**
 * Get index statistics
 */
async function getStats() {
    if (!index) await initVectorDB();

    try {
        const stats = await index.describeIndexStats();
        return {
            totalDocuments: stats.totalRecordCount || 0,
            indexName: config.pinecone.indexName || INDEX_NAME,
            dimension: stats.dimension || 768
        };
    } catch (error) {
        logger.error(`Failed to get stats: ${error.message}`);
        return { totalDocuments: 0, indexName: INDEX_NAME };
    }
}

/**
 * Delete all documents (for testing/reset)
 */
async function deleteAll() {
    if (!index) await initVectorDB();

    try {
        await index.namespace(NAMESPACE).deleteAll();
        logger.info('All documents deleted from Pinecone');
        return true;
    } catch (error) {
        logger.error(`Failed to delete all: ${error.message}`);
        return false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    initVectorDB,
    addDocuments,
    queryRelevant,
    deleteOldDocuments,
    getStats,
    deleteAll
};
