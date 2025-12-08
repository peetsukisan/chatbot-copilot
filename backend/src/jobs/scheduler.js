/**
 * Scheduled Jobs Scheduler
 * Manages all cron jobs for the chatbot system
 */

const cron = require('node-cron');
const { generateDailyReport } = require('../services/reports/dailyReport');
const { runWakeupCampaign, syncPromotions } = require('./wakeupCampaign');
const logger = require('../utils/logger');

function setupScheduledJobs(io) {
    // Daily report at 23:30
    cron.schedule('30 23 * * *', async () => {
        logger.info('Running: Daily Report Generation');
        try {
            const report = await generateDailyReport();
            io.to('admin-room').emit('daily-report-generated', { reportId: report.id });
            logger.info('Daily report generated successfully');
        } catch (error) {
            logger.error(`Daily report failed: ${error.message}`);
        }
    }, { timezone: 'Asia/Bangkok' });

    // Wake-up campaign at 14:00
    cron.schedule('0 14 * * *', async () => {
        logger.info('Running: Wake-up Campaign');
        try {
            const result = await runWakeupCampaign(io);
            logger.info(`Wake-up campaign: ${result.sent} sent, ${result.skipped} skipped`);
        } catch (error) {
            logger.error(`Wake-up campaign failed: ${error.message}`);
        }
    }, { timezone: 'Asia/Bangkok' });

    // Sync promotions from Facebook at 09:00 daily
    cron.schedule('0 9 * * *', async () => {
        logger.info('Running: Sync Promotions from Facebook');
        try {
            const count = await syncPromotions();
            logger.info(`Synced ${count} promotions from Facebook`);
        } catch (error) {
            logger.error(`Promotion sync failed: ${error.message}`);
        }
    }, { timezone: 'Asia/Bangkok' });

    logger.info('Scheduled jobs initialized:');
    logger.info('  - Daily Report: 23:30');
    logger.info('  - Wake-up Campaign: 14:00');
    logger.info('  - Sync Promotions: 09:00');
}

module.exports = { setupScheduledJobs };
