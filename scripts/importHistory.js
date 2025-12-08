/**
 * Import Chat History Script
 * Imports 60 days of chat history from Facebook and indexes into vector DB
 */

require('dotenv').config({ path: '../backend/.env' });

const { syncAllChats, formatForTraining } = require('../backend/src/services/facebook/graphApi');
const { initVectorDB, addDocuments } = require('../backend/src/services/vector/pinecone');
const { initDatabase } = require('../backend/src/models/database');
const logger = require('../backend/src/utils/logger');

async function importHistory() {
    console.log('🚀 Starting chat history import...\n');

    try {
        // Initialize database
        console.log('📦 Initializing database...');
        await initDatabase();

        // Initialize vector DB
        console.log('🧠 Initializing vector database...');
        await initVectorDB();

        // Sync chats from Facebook
        console.log('📥 Fetching chats from Facebook (last 60 days)...');
        const chatData = await syncAllChats();
        console.log(`   Found ${chatData.length} conversations\n`);

        // Format for training
        console.log('🔄 Formatting Q&A pairs...');
        const trainingPairs = formatForTraining(chatData);
        console.log(`   Created ${trainingPairs.length} training pairs\n`);

        // Add to vector DB in batches
        console.log('💾 Adding to vector database...');
        const batchSize = 50;
        let added = 0;

        for (let i = 0; i < trainingPairs.length; i += batchSize) {
            const batch = trainingPairs.slice(i, i + batchSize);
            await addDocuments(batch);
            added += batch.length;
            console.log(`   Progress: ${added}/${trainingPairs.length}`);
        }

        console.log('\n✅ Import completed successfully!');
        console.log(`   Total conversations: ${chatData.length}`);
        console.log(`   Total Q&A pairs: ${trainingPairs.length}`);

    } catch (error) {
        console.error('\n❌ Import failed:', error.message);
        process.exit(1);
    }
}

// Run
importHistory();
