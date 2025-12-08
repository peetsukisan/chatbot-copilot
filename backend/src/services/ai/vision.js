/**
 * Gemini Vision Service
 * Analyzes images sent by customers using Gemini 1.5 Flash Vision
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

let genAI = null;
let visionModel = null;

/**
 * Initialize Gemini Vision
 */
function initVision() {
    const apiKey = config.gemini.getCurrentKey();
    if (!apiKey) {
        throw new Error('No Gemini API key configured');
    }
    genAI = new GoogleGenerativeAI(apiKey);
    visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    logger.info('Gemini Vision initialized');
}

/**
 * Download image from URL and convert to base64
 * @param {string} imageUrl - URL of the image
 */
async function downloadImage(imageUrl) {
    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000
        });

        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';

        return { base64, mimeType };
    } catch (error) {
        logger.error(`Failed to download image: ${error.message}`);
        throw error;
    }
}

/**
 * Analyze image and extract information
 * @param {string} imageUrl - URL of the image from Facebook
 * @param {string} context - Optional context about what to look for
 */
async function analyzeImage(imageUrl, context = '') {
    if (!visionModel) initVision();

    try {
        // Download image
        const { base64, mimeType } = await downloadImage(imageUrl);

        // Create image part for Gemini
        const imagePart = {
            inlineData: {
                data: base64,
                mimeType
            }
        };

        // Build prompt
        const prompt = `วิเคราะห์รูปภาพนี้และอธิบายเป็นภาษาไทย

${context ? `บริบท: ${context}` : ''}

กรุณาระบุ:
1. ประเภทของรูป (สลิปโอนเงิน, เอกสาร, รูปทั่วไป, etc.)
2. ข้อมูลสำคัญที่เห็น (ตัวเลข, วันที่, ชื่อ, etc.)
3. สรุปสั้นๆ ว่ารูปนี้เกี่ยวกับอะไร

ตอบเป็น JSON:
{
  "type": "ประเภทรูป",
  "details": {
    "amount": "จำนวนเงิน (ถ้ามี)",
    "date": "วันที่ (ถ้ามี)",
    "reference": "เลขอ้างอิง (ถ้ามี)",
    "other": "ข้อมูลอื่นๆ"
  },
  "summary": "สรุปสั้นๆ",
  "confidence": 0.0-1.0
}`;

        // Generate response
        const result = await visionModel.generateContent([prompt, imagePart]);
        const response = result.response;
        const text = response.text();

        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                logger.info(`Image analyzed: ${parsed.type}`);
                return {
                    success: true,
                    ...parsed,
                    rawText: text
                };
            } catch (e) {
                logger.warn('Failed to parse image analysis JSON');
            }
        }

        // Fallback
        return {
            success: true,
            type: 'unknown',
            details: {},
            summary: text,
            confidence: 0.5,
            rawText: text
        };

    } catch (error) {
        logger.error(`Image analysis failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            type: 'error',
            summary: 'ไม่สามารถวิเคราะห์รูปได้'
        };
    }
}

/**
 * Analyze slip/receipt image specifically
 * @param {string} imageUrl - URL of the slip image
 */
async function analyzeSlip(imageUrl) {
    if (!visionModel) initVision();

    try {
        const { base64, mimeType } = await downloadImage(imageUrl);

        const imagePart = {
            inlineData: {
                data: base64,
                mimeType
            }
        };

        const prompt = `นี่คือสลิปการโอนเงิน กรุณาอ่านข้อมูลและตอบเป็น JSON:
{
  "isSlip": true/false,
  "amount": "จำนวนเงิน",
  "currency": "สกุลเงิน",
  "date": "วันที่ทำรายการ",
  "time": "เวลา",
  "fromAccount": "บัญชีผู้โอน",
  "toAccount": "บัญชีผู้รับ",
  "bankName": "ชื่อธนาคาร",
  "reference": "เลขอ้างอิง",
  "status": "สถานะ (สำเร็จ/รอดำเนินการ)",
  "confidence": 0.0-1.0
}

ถ้าไม่ใช่สลิป ให้ตอบ {"isSlip": false}`;

        const result = await visionModel.generateContent([prompt, imagePart]);
        const text = result.response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                logger.warn('Failed to parse slip JSON');
            }
        }

        return { isSlip: false, error: 'Could not parse slip' };

    } catch (error) {
        logger.error(`Slip analysis failed: ${error.message}`);
        return { isSlip: false, error: error.message };
    }
}

/**
 * Analyze ID card image
 * @param {string} imageUrl - URL of the ID card image
 */
async function analyzeIdCard(imageUrl) {
    if (!visionModel) initVision();

    try {
        const { base64, mimeType } = await downloadImage(imageUrl);

        const imagePart = {
            inlineData: {
                data: base64,
                mimeType
            }
        };

        const prompt = `นี่คือรูปบัตรประชาชน กรุณาอ่านข้อมูล (ไม่ต้องแสดงเลขบัตรเต็ม ให้แสดงแค่ 4 ตัวท้าย):
{
  "isIdCard": true/false,
  "namePrefix": "คำนำหน้า",
  "firstName": "ชื่อ",
  "lastName": "นามสกุล",
  "lastFourDigits": "4 ตัวท้ายของเลขบัตร",
  "dateOfBirth": "วันเกิด",
  "expiryDate": "วันหมดอายุ",
  "address": "ที่อยู่ (ถ้าเห็น)",
  "confidence": 0.0-1.0
}`;

        const result = await visionModel.generateContent([prompt, imagePart]);
        const text = result.response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                logger.warn('Failed to parse ID card JSON');
            }
        }

        return { isIdCard: false, error: 'Could not parse ID card' };

    } catch (error) {
        logger.error(`ID card analysis failed: ${error.message}`);
        return { isIdCard: false, error: error.message };
    }
}

/**
 * Create description for RAG storage
 * @param {object} analysis - Analysis result
 */
function createRagDescription(analysis) {
    if (!analysis.success && !analysis.isSlip && !analysis.isIdCard) {
        return null;
    }

    let description = '';

    if (analysis.type) {
        description = `รูปประเภท: ${analysis.type}. ${analysis.summary || ''}`;
    } else if (analysis.isSlip) {
        description = `สลิปโอนเงิน: ${analysis.amount} ${analysis.currency || 'บาท'} วันที่ ${analysis.date || 'ไม่ระบุ'}`;
    } else if (analysis.isIdCard) {
        description = `บัตรประชาชน: ${analysis.namePrefix || ''}${analysis.firstName || ''} ${analysis.lastName || ''}`;
    }

    return description;
}

module.exports = {
    analyzeImage,
    analyzeSlip,
    analyzeIdCard,
    createRagDescription,
    downloadImage
};
