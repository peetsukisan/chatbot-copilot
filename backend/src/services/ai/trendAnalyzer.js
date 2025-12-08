/**
 * Trend Analyzer Service (Feature #5)
 * Analyzes chat trends and generates FAQ suggestions
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../utils/config');
const logger = require('../../utils/logger');
const db = require('../../models/database');

/**
 * Analyze trends from recent messages
 * @param {string} period - Time period ('7d', '30d', '60d')
 */
async function analyzeTrends(period = '7d') {
    const days = parseInt(period) || 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    try {
        // Get all intents from the period
        const messages = await getMessagesFromPeriod(cutoff);

        if (messages.length === 0) {
            return {
                period,
                totalMessages: 0,
                topTopics: [],
                suggestedFAQs: [],
                emergingIssues: []
            };
        }

        // Count intents
        const intentCounts = {};
        for (const msg of messages) {
            if (msg.intent) {
                intentCounts[msg.intent] = (intentCounts[msg.intent] || 0) + 1;
            }
        }

        // Sort by count
        const topTopics = Object.entries(intentCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([intent, count]) => ({
                intent,
                count,
                percentage: Math.round((count / messages.length) * 100)
            }));

        // Generate FAQ suggestions using AI
        const suggestedFAQs = await generateFAQSuggestions(messages.slice(0, 50));

        // Find emerging issues (topics trending up)
        const emergingIssues = await detectEmergingIssues(days);

        logger.info(`Trend analysis complete: ${messages.length} messages, ${topTopics.length} topics`);

        return {
            period,
            totalMessages: messages.length,
            analyzedAt: new Date().toISOString(),
            topTopics,
            suggestedFAQs,
            emergingIssues
        };
    } catch (error) {
        logger.error(`Trend analysis failed: ${error.message}`);
        throw error;
    }
}

/**
 * Get messages from a specific period
 */
async function getMessagesFromPeriod(since) {
    const database = db.getDatabase();
    const stmt = database.prepare(`
    SELECT * FROM messages 
    WHERE created_at >= ? AND sender = 'customer'
    ORDER BY created_at DESC
  `);

    return stmt.all(since.toISOString());
}

/**
 * Generate FAQ suggestions from common questions
 */
async function generateFAQSuggestions(messages) {
    if (messages.length === 0) return [];

    const genAI = new GoogleGenerativeAI(config.gemini.getCurrentKey());
    const model = genAI.getGenerativeModel({ model: config.gemini.model });

    // Get unique questions
    const questions = [...new Set(messages.map(m => m.text))].slice(0, 20);

    const prompt = `วิเคราะห์คำถามที่ลูกค้าถามบ่อย และสร้าง FAQ 5 ข้อที่จะช่วยตอบคำถามเหล่านี้

คำถามจากลูกค้า:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

สร้าง FAQ เป็น JSON array:
[
  {
    "question": "คำถาม FAQ",
    "answer": "คำตอบ",
    "category": "หมวดหมู่",
    "frequency": "high|medium|low"
  }
]`;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        logger.error(`FAQ generation failed: ${error.message}`);
    }

    return [];
}

/**
 * Detect emerging issues by comparing recent vs previous period
 */
async function detectEmergingIssues(days) {
    const database = db.getDatabase();

    // Get intent counts for recent period
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - Math.ceil(days / 2));

    const previousCutoff = new Date();
    previousCutoff.setDate(previousCutoff.getDate() - days);

    const recentStmt = database.prepare(`
    SELECT intent, COUNT(*) as count FROM messages
    WHERE created_at >= ? AND sender = 'customer' AND intent IS NOT NULL
    GROUP BY intent
  `);

    const previousStmt = database.prepare(`
    SELECT intent, COUNT(*) as count FROM messages
    WHERE created_at >= ? AND created_at < ? AND sender = 'customer' AND intent IS NOT NULL
    GROUP BY intent
  `);

    const recentCounts = {};
    const previousCounts = {};

    for (const row of recentStmt.all(recentCutoff.toISOString())) {
        recentCounts[row.intent] = row.count;
    }

    for (const row of previousStmt.all(previousCutoff.toISOString(), recentCutoff.toISOString())) {
        previousCounts[row.intent] = row.count;
    }

    // Find topics with significant increase
    const emergingIssues = [];

    for (const [intent, recentCount] of Object.entries(recentCounts)) {
        const previousCount = previousCounts[intent] || 0;

        if (previousCount === 0 && recentCount >= 3) {
            // New topic
            emergingIssues.push({
                intent,
                recentCount,
                previousCount,
                change: 'new',
                changePercent: 100
            });
        } else if (previousCount > 0) {
            const changePercent = Math.round(((recentCount - previousCount) / previousCount) * 100);

            if (changePercent >= 50) {
                emergingIssues.push({
                    intent,
                    recentCount,
                    previousCount,
                    change: 'increasing',
                    changePercent
                });
            }
        }
    }

    return emergingIssues.sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);
}

/**
 * Get daily message counts for charting
 */
async function getDailyStats(days = 30) {
    const database = db.getDatabase();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const stmt = database.prepare(`
    SELECT 
      date(created_at) as date,
      COUNT(*) as total,
      SUM(CASE WHEN sender = 'customer' THEN 1 ELSE 0 END) as customer,
      SUM(CASE WHEN sender = 'ai' THEN 1 ELSE 0 END) as ai,
      SUM(CASE WHEN sender = 'staff' THEN 1 ELSE 0 END) as staff
    FROM messages
    WHERE created_at >= ?
    GROUP BY date(created_at)
    ORDER BY date ASC
  `);

    return stmt.all(cutoff.toISOString());
}

module.exports = {
    analyzeTrends,
    generateFAQSuggestions,
    detectEmergingIssues,
    getDailyStats
};
