/**
 * Facebook Posts Service
 * Fetches and analyzes posts from Facebook Page for promotions
 */

const axios = require('axios');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

const GRAPH_API_URL = config.facebook.graphApiUrl;
const API_VERSION = config.facebook.apiVersion;

/**
 * Fetch posts from Facebook Page (last N days)
 * @param {number} days - Number of days to look back
 */
async function fetchPagePosts(days = 60) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);

    try {
        const response = await axios.get(
            `${GRAPH_API_URL}/${API_VERSION}/me/posts`,
            {
                params: {
                    access_token: config.facebook.pageAccessToken,
                    fields: 'id,message,created_time,full_picture,permalink_url,shares,reactions.summary(true),comments.summary(true)',
                    since: sinceTimestamp,
                    limit: 100
                }
            }
        );

        const posts = response.data.data || [];
        logger.info(`Fetched ${posts.length} posts from last ${days} days`);

        return posts.map(post => ({
            id: post.id,
            message: post.message || '',
            createdTime: post.created_time,
            imageUrl: post.full_picture || null,
            link: post.permalink_url,
            shares: post.shares?.count || 0,
            reactions: post.reactions?.summary?.total_count || 0,
            comments: post.comments?.summary?.total_count || 0,
            engagement: (post.shares?.count || 0) +
                (post.reactions?.summary?.total_count || 0) +
                (post.comments?.summary?.total_count || 0)
        }));

    } catch (error) {
        logger.error(`Failed to fetch posts: ${error.message}`);
        return [];
    }
}

/**
 * Analyze posts to find promotions using keywords
 * @param {Array} posts - Array of posts
 */
function findPromotionPosts(posts) {
    const promotionKeywords = [
        'โปรโมชั่น', 'โปรโมชัน', 'promo', 'promotion',
        'ส่วนลด', 'discount', 'ลด',
        'ฟรี', 'free', 'แถม',
        'พิเศษ', 'special', 'deal',
        'สิทธิพิเศษ', 'privilege',
        'แคมเปญ', 'campaign',
        'ดอกเบี้ย', 'interest',
        'cashback', 'แคชแบ็ค',
        'สมัครวันนี้', 'apply today',
        'ถึง', 'until', 'หมดเขต'
    ];

    return posts.filter(post => {
        const message = post.message.toLowerCase();
        return promotionKeywords.some(keyword =>
            message.includes(keyword.toLowerCase())
        );
    }).map(post => ({
        ...post,
        isPromotion: true,
        promotionScore: calculatePromotionScore(post)
    }));
}

/**
 * Calculate promotion effectiveness score
 * Based on engagement and recency
 */
function calculatePromotionScore(post) {
    const engagementScore = Math.min(post.engagement / 100, 10); // Max 10 points

    const ageInDays = (Date.now() - new Date(post.createdTime).getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(10 - ageInDays / 6, 0); // Newer = higher score

    return Math.round((engagementScore + recencyScore) * 5); // Score 0-100
}

/**
 * Get best promotions for wake-up campaign
 * @param {number} limit - Number of promotions to return
 */
async function getBestPromotions(limit = 5) {
    const posts = await fetchPagePosts(60);
    const promotions = findPromotionPosts(posts);

    // Sort by score (highest first)
    promotions.sort((a, b) => b.promotionScore - a.promotionScore);

    return promotions.slice(0, limit).map(promo => ({
        id: promo.id,
        message: promo.message,
        shortMessage: promo.message.substring(0, 100) + (promo.message.length > 100 ? '...' : ''),
        imageUrl: promo.imageUrl,
        link: promo.link,
        engagement: promo.engagement,
        score: promo.promotionScore,
        createdTime: promo.createdTime
    }));
}

/**
 * Extract promotion details for wake-up message
 * @param {object} promotion - Promotion post
 */
function extractPromotionDetails(promotion) {
    const message = promotion.message;

    // Extract dates (Thai format)
    const datePattern = /(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|\w+)\s*(\d{2,4})?/g;
    const dates = message.match(datePattern) || [];

    // Extract percentages
    const percentPattern = /(\d+)\s*%/g;
    const percents = message.match(percentPattern) || [];

    // Extract amounts
    const amountPattern = /(\d{1,3}(,\d{3})*)\s*(บาท|THB|฿)/gi;
    const amounts = message.match(amountPattern) || [];

    return {
        dates,
        discountPercents: percents,
        amounts,
        hasExpiry: dates.length > 0,
        hasDiscount: percents.length > 0 || amounts.length > 0
    };
}

/**
 * Generate wake-up message based on promotion
 * @param {object} promotion - Best promotion to use
 * @param {object} customer - Customer info
 */
function generateWakeupMessage(promotion, customer) {
    const details = extractPromotionDetails(promotion);
    const customerName = customer.name || 'คุณลูกค้า';

    let message = `สวัสดีครับ ${customerName}! 👋\n\n`;
    message += `มีโปรโมชั่นพิเศษมาแจ้งให้ทราบครับ:\n\n`;
    message += `📢 ${promotion.shortMessage}\n\n`;

    if (details.hasExpiry) {
        message += `⏰ รีบหน่อยนะครับ โปรโมชั่นมีระยะเวลาจำกัด!\n`;
    }

    message += `\n🔗 ดูรายละเอียดเพิ่มเติม: ${promotion.link}\n`;
    message += `\nหากมีคำถามเพิ่มเติม ทักมาได้เลยครับ 😊`;

    return message;
}

module.exports = {
    fetchPagePosts,
    findPromotionPosts,
    getBestPromotions,
    extractPromotionDetails,
    generateWakeupMessage,
    calculatePromotionScore
};
