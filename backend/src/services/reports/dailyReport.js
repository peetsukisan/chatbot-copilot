/**
 * Daily Report Generator (Feature #10)
 * Generates comprehensive daily reports
 */

const { format, subDays } = require('date-fns');
const { th } = require('date-fns/locale');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../utils/config');
const logger = require('../../utils/logger');
const db = require('../../models/database');
const { analyzeTrends } = require('../ai/trendAnalyzer');

/**
 * Generate daily report
 * @param {Date} date - Report date (default: yesterday)
 */
async function generateDailyReport(date = subDays(new Date(), 1)) {
    const reportDate = format(date, 'yyyy-MM-dd');
    const displayDate = format(date, 'd MMMM yyyy', { locale: th });

    logger.info(`Generating daily report for ${reportDate}`);

    try {
        const database = db.getDatabase();

        // Get message statistics
        const messageStats = getMessageStats(database, reportDate);

        // Get conversation statistics
        const conversationStats = getConversationStats(database, reportDate);

        // Get AI performance
        const aiPerformance = getAIPerformance(database, reportDate);

        // Get top intents
        const topIntents = getTopIntents(database, reportDate);

        // Get escalation statistics
        const escalationStats = getEscalationStats(database, reportDate);

        // Get customer statistics
        const customerStats = getCustomerStats(database, reportDate);

        // Generate AI recommendations
        const recommendations = await generateRecommendations({
            messageStats,
            aiPerformance,
            topIntents,
            escalationStats
        });

        const report = {
            id: `report_${reportDate}`,
            date: reportDate,
            displayDate,
            generatedAt: new Date().toISOString(),

            summary: {
                totalMessages: messageStats.total,
                totalConversations: conversationStats.total,
                aiHandledPercent: aiPerformance.handledPercent,
                avgResponseTime: messageStats.avgResponseTime,
                customerSatisfaction: calculateSatisfactionScore(messageStats)
            },

            messages: messageStats,
            conversations: conversationStats,
            aiPerformance,
            topIntents,
            escalations: escalationStats,
            customers: customerStats,
            recommendations
        };

        // Save report to database
        await saveReport(database, report);

        logger.info(`Daily report generated: ${report.id}`);
        return report;
    } catch (error) {
        logger.error(`Failed to generate daily report: ${error.message}`);
        throw error;
    }
}

/**
 * Get message statistics
 */
function getMessageStats(database, date) {
    const stmt = database.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN sender = 'customer' THEN 1 ELSE 0 END) as fromCustomer,
      SUM(CASE WHEN sender = 'ai' THEN 1 ELSE 0 END) as fromAI,
      SUM(CASE WHEN sender = 'staff' THEN 1 ELSE 0 END) as fromStaff,
      AVG(CASE WHEN sender != 'customer' THEN response_time_ms ELSE NULL END) as avgResponseTime
    FROM messages
    WHERE date(created_at) = ?
  `);

    const result = stmt.get(date);

    return {
        total: result.total || 0,
        fromCustomer: result.fromCustomer || 0,
        fromAI: result.fromAI || 0,
        fromStaff: result.fromStaff || 0,
        avgResponseTime: result.avgResponseTime ? `${Math.round(result.avgResponseTime / 1000)}s` : 'N/A'
    };
}

/**
 * Get conversation statistics
 */
function getConversationStats(database, date) {
    const stmt = database.prepare(`
    SELECT 
      COUNT(DISTINCT sender_id) as total,
      COUNT(DISTINCT CASE WHEN is_new_customer = 1 THEN sender_id END) as newCustomers
    FROM messages
    WHERE date(created_at) = ? AND sender = 'customer'
  `);

    const result = stmt.get(date);

    return {
        total: result.total || 0,
        newCustomers: result.newCustomers || 0,
        returningCustomers: (result.total || 0) - (result.newCustomers || 0)
    };
}

/**
 * Get AI performance metrics
 */
function getAIPerformance(database, date) {
    const stmt = database.prepare(`
    SELECT 
      COUNT(*) as total,
      AVG(confidence) as avgConfidence,
      SUM(CASE WHEN escalated = 0 THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN escalated = 1 THEN 1 ELSE 0 END) as escalated
    FROM messages
    WHERE date(created_at) = ? AND sender = 'ai'
  `);

    const result = stmt.get(date);
    const total = result.total || 0;

    return {
        totalResponses: total,
        avgConfidence: result.avgConfidence ? Math.round(result.avgConfidence * 100) : 0,
        resolved: result.resolved || 0,
        escalated: result.escalated || 0,
        handledPercent: total > 0 ? Math.round((result.resolved / total) * 100) : 0
    };
}

/**
 * Get top intents for the day
 */
function getTopIntents(database, date) {
    const stmt = database.prepare(`
    SELECT intent, COUNT(*) as count
    FROM messages
    WHERE date(created_at) = ? AND sender = 'customer' AND intent IS NOT NULL
    GROUP BY intent
    ORDER BY count DESC
    LIMIT 10
  `);

    return stmt.all(date).map(row => ({
        intent: row.intent,
        count: row.count
    }));
}

/**
 * Get escalation statistics
 */
function getEscalationStats(database, date) {
    const stmt = database.prepare(`
    SELECT 
      escalation_reason,
      COUNT(*) as count
    FROM messages
    WHERE date(created_at) = ? AND escalated = 1
    GROUP BY escalation_reason
    ORDER BY count DESC
  `);

    const reasons = stmt.all(date);
    const total = reasons.reduce((sum, r) => sum + r.count, 0);

    return {
        total,
        byReason: reasons.map(r => ({
            reason: r.escalation_reason || 'ไม่ระบุ',
            count: r.count
        }))
    };
}

/**
 * Get customer statistics
 */
function getCustomerStats(database, date) {
    const stmt = database.prepare(`
    SELECT 
      COUNT(DISTINCT c.id) as activeCustomers,
      AVG(c.total_conversations) as avgConversations
    FROM customers c
    WHERE date(c.last_contact) = ?
  `);

    const result = stmt.get(date);

    return {
        activeCustomers: result.activeCustomers || 0,
        avgConversationsPerCustomer: Math.round(result.avgConversations || 0)
    };
}

/**
 * Calculate satisfaction score (simple heuristic)
 */
function calculateSatisfactionScore(messageStats) {
    // Simple heuristic based on AI resolution rate
    if (messageStats.fromAI === 0) return 'N/A';

    const aiPercent = (messageStats.fromAI / messageStats.total) * 100;

    if (aiPercent >= 70) return 4.5;
    if (aiPercent >= 50) return 4.0;
    if (aiPercent >= 30) return 3.5;
    return 3.0;
}

/**
 * Generate AI recommendations
 */
async function generateRecommendations(data) {
    const genAI = new GoogleGenerativeAI(config.gemini.getCurrentKey());
    const model = genAI.getGenerativeModel({ model: config.gemini.model });

    const prompt = `วิเคราะห์ข้อมูลประจำวันและให้คำแนะนำ 3-5 ข้อ เป็นภาษาไทย

ข้อมูลวันนี้:
- ข้อความทั้งหมด: ${data.messageStats.total}
- AI ตอบ: ${data.messageStats.fromAI} (${data.aiPerformance.handledPercent}%)
- ความมั่นใจ AI เฉลี่ย: ${data.aiPerformance.avgConfidence}%
- ส่งต่อเจ้าหน้าที่: ${data.escalationStats.total}
- หัวข้อยอดนิยม: ${data.topIntents.slice(0, 3).map(t => t.intent).join(', ')}

ให้คำแนะนำเป็น JSON array:
[
  {
    "type": "improvement|warning|positive",
    "title": "หัวข้อ",
    "description": "รายละเอียด"
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
        logger.error(`Failed to generate recommendations: ${error.message}`);
    }

    return [
        {
            type: 'positive',
            title: 'ระบบทำงานปกติ',
            description: 'ไม่พบปัญหาที่ต้องดำเนินการเร่งด่วน'
        }
    ];
}

/**
 * Save report to database
 */
async function saveReport(database, report) {
    const stmt = database.prepare(`
    INSERT OR REPLACE INTO daily_reports (
      id, report_date, data, generated_at
    ) VALUES (?, ?, ?, ?)
  `);

    stmt.run(
        report.id,
        report.date,
        JSON.stringify(report),
        report.generatedAt
    );
}

/**
 * Get report by date
 */
async function getReport(date) {
    const database = db.getDatabase();
    const stmt = database.prepare(`
    SELECT * FROM daily_reports WHERE report_date = ?
  `);

    const row = stmt.get(date);
    if (row) {
        return JSON.parse(row.data);
    }

    return null;
}

/**
 * Get recent reports
 */
async function getRecentReports(limit = 7) {
    const database = db.getDatabase();
    const stmt = database.prepare(`
    SELECT * FROM daily_reports
    ORDER BY report_date DESC
    LIMIT ?
  `);

    return stmt.all(limit).map(row => JSON.parse(row.data));
}

module.exports = {
    generateDailyReport,
    getReport,
    getRecentReports
};
