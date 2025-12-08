/**
 * ChromaDB Vector Database Service
 * Handles storing and querying chat embeddings for context retrieval
 */

const { ChromaClient, OpenAIEmbeddingFunction } = require('chromadb');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

let client = null;
let collection = null;
let genAI = null;

const COLLECTION_NAME = 'chat_history';

/**
 * Custom embedding function using Gemini
 */
class GeminiEmbeddingFunction {
    constructor(apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: config.gemini.embeddingModel });
    }

    async generate(texts) {
        const embeddings = [];

        for (const text of texts) {
            try {
                const result = await this.model.embedContent(text);
                embeddings.push(result.embedding.values);
            } catch (error) {
                logger.error(`Failed to generate embedding: ${error.message}`);
                // Return zero vector as fallback
                embeddings.push(new Array(768).fill(0));
            }
        }

        return embeddings;
    }
}

/**
 * Initialize ChromaDB and collection
 */
async function initVectorDB() {
    try {
        // Initialize ChromaDB client (local mode)
        client = new ChromaClient({
            path: config.database.chromaPath
        });

        // Initialize embedding function
        const embeddingFunction = new GeminiEmbeddingFunction(config.gemini.getCurrentKey());

        // Get or create collection
        collection = await client.getOrCreateCollection({
            name: COLLECTION_NAME,
            embeddingFunction,
            metadata: { description: 'Chat history Q&A pairs for context retrieval' }
        });

        const count = await collection.count();
        logger.info(`ChromaDB initialized with ${count} documents`);

        return collection;
    } catch (error) {
        logger.error(`Failed to initialize ChromaDB: ${error.message}`);
        throw error;
    }
}

/**
 * Add documents to vector database
 * @param {Array} documents - Array of Q&A pairs
 */
async function addDocuments(documents) {
    if (!collection) await initVectorDB();

    const ids = [];
    const texts = [];
    const metadatas = [];

    for (const doc of documents) {
        const id = `${doc.conversationId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        ids.push(id);
        texts.push(`คำถาม: ${doc.question}\nคำตอบ: ${doc.answer}`);
        metadatas.push({
            conversationId: doc.conversationId,
            customerId: doc.customerId || '',
            question: doc.question,
            answer: doc.answer,
            timestamp: doc.timestamp || new Date().toISOString()
        });
    }

    try {
        await collection.add({
            ids,
            documents: texts,
            metadatas
        });

        logger.info(`Added ${documents.length} documents to vector DB`);
        return ids;
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
    if (!collection) await initVectorDB();

    try {
        const results = await collection.query({
            queryTexts: [query],
            nResults: topK
        });

        if (!results.metadatas?.[0]) {
            return [];
        }

        // Format results
        const relevantDocs = results.metadatas[0].map((metadata, index) => ({
            question: metadata.question,
            answer: metadata.answer,
            conversationId: metadata.conversationId,
            customerId: metadata.customerId,
            timestamp: metadata.timestamp,
            distance: results.distances?.[0]?.[index] || 0
        }));

        logger.debug(`Found ${relevantDocs.length} relevant documents for query`);
        return relevantDocs;
    } catch (error) {
        logger.error(`Failed to query vector DB: ${error.message}`);
        return [];
    }
}

/**
 * Delete old documents (older than specified days)
 * @param {number} days - Delete documents older than this
 */
async function deleteOldDocuments(days = 60) {
    if (!collection) await initVectorDB();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.toISOString();

    try {
        // Get all documents
        const allDocs = await collection.get();

        // Find documents to delete
        const idsToDelete = [];
        for (let i = 0; i < allDocs.ids.length; i++) {
            const metadata = allDocs.metadatas[i];
            if (metadata.timestamp && metadata.timestamp < cutoffTimestamp) {
                idsToDelete.push(allDocs.ids[i]);
            }
        }

        if (idsToDelete.length > 0) {
            await collection.delete({
                ids: idsToDelete
            });
            logger.info(`Deleted ${idsToDelete.length} old documents`);
        }

        return idsToDelete.length;
    } catch (error) {
        logger.error(`Failed to delete old documents: ${error.message}`);
        return 0;
    }
}

/**
 * Get collection statistics
 */
async function getStats() {
    if (!collection) await initVectorDB();

    try {
        const count = await collection.count();
        return {
            totalDocuments: count,
            collectionName: COLLECTION_NAME
        };
    } catch (error) {
        logger.error(`Failed to get stats: ${error.message}`);
        return { totalDocuments: 0, collectionName: COLLECTION_NAME };
    }
}

/**
 * Search documents by metadata
 * @param {object} filter - Metadata filter
 */
async function searchByMetadata(filter, limit = 10) {
    if (!collection) await initVectorDB();

    try {
        const results = await collection.get({
            where: filter,
            limit
        });

        return results.metadatas || [];
    } catch (error) {
        logger.error(`Failed to search by metadata: ${error.message}`);
        return [];
    }
}

module.exports = {
    initVectorDB,
    addDocuments,
    queryRelevant,
    deleteOldDocuments,
    getStats,
    searchByMetadata
};
