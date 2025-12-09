/**
 * Database initialization and connection
 * Uses better-sqlite3 for synchronous SQLite operations
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../utils/config');
const logger = require('../utils/logger');

let db = null;

/**
 * Initialize the database with all required tables
 */
async function initDatabase() {
  const dbPath = path.resolve(config.database.sqlitePath);
  const dbDir = path.dirname(dbPath);

  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create tables
  createTables();

  logger.info(`Database initialized at ${dbPath}`);
  return db;
}

/**
 * Create all required tables
 */
function createTables() {
  // Customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      fb_user_id TEXT UNIQUE NOT NULL,
      name TEXT,
      profile_pic TEXT,
      first_contact DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_contact DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_conversations INTEGER DEFAULT 0,
      detected_intents TEXT,
      sentiment_avg REAL DEFAULT 0,
      notes TEXT,
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      text TEXT NOT NULL,
      sender TEXT CHECK(sender IN ('customer', 'ai', 'staff')) NOT NULL,
      staff_id TEXT,
      intent TEXT,
      intent_confidence REAL,
      confidence REAL,
      escalated INTEGER DEFAULT 0,
      escalation_reason TEXT,
      response_time_ms INTEGER,
      is_new_customer INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES customers(fb_user_id)
    )
  `);

  // Menu options table
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_num INTEGER NOT NULL,
      emoji TEXT,
      text TEXT NOT NULL,
      keywords TEXT,
      auto_response TEXT,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Wake-up campaigns table
  db.exec(`
    CREATE TABLE IF NOT EXISTS wakeup_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      inactive_days INTEGER NOT NULL,
      message_template TEXT NOT NULL,
      target_segment TEXT,
      enabled INTEGER DEFAULT 1,
      last_run DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Wake-up logs table (with promotion support)
  db.exec(`
    CREATE TABLE IF NOT EXISTS wakeup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      customer_id TEXT NOT NULL,
      promotion_id TEXT,
      message_sent TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      response_received INTEGER DEFAULT 0,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // Daily reports table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_reports (
      id TEXT PRIMARY KEY,
      report_date DATE UNIQUE NOT NULL,
      data TEXT NOT NULL,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Conversations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      status TEXT DEFAULT 'active',
      ai_handled INTEGER DEFAULT 0,
      ai_confidence_avg REAL,
      escalated INTEGER DEFAULT 0,
      summary TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // Promotions table (Facebook Page posts for wake-up campaigns)
  db.exec(`
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fb_post_id TEXT UNIQUE NOT NULL,
      message TEXT NOT NULL,
      short_message TEXT,
      image_url TEXT,
      link TEXT,
      engagement_score INTEGER DEFAULT 0,
      promotion_score INTEGER DEFAULT 0,
      expires_at DATETIME,
      created_at DATETIME,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pending messages table (for test mode)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_messages (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT CHECK(source IN ('ai', 'staff', 'campaign', 'wakeup')) NOT NULL,
      metadata TEXT,
      status TEXT CHECK(status IN ('pending', 'approved', 'sent', 'rejected')) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME,
      sent_at DATETIME
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_intent ON messages(intent);
    CREATE INDEX IF NOT EXISTS idx_customers_last_contact ON customers(last_contact);
    CREATE INDEX IF NOT EXISTS idx_promotions_score ON promotions(promotion_score);
    CREATE INDEX IF NOT EXISTS idx_pending_messages_status ON pending_messages(status);
  `);

  // Insert default menu options if empty
  const menuCount = db.prepare('SELECT COUNT(*) as count FROM menu_options').get();
  if (menuCount.count === 0) {
    insertDefaultMenuOptions();
  }

  logger.info('Database tables created/verified');
}

/**
 * Insert default menu options
 */
function insertDefaultMenuOptions() {
  const defaultOptions = [
    { order: 1, emoji: '📝', text: 'เปิดบัญชี', keywords: 'เปิดบัญชี,สมัคร,register,account', autoResponse: 'สำหรับการเปิดบัญชี กรุณาเตรียมเอกสาร:\n1. บัตรประชาชน\n2. หลักฐานที่อยู่\n\nสนใจเปิดบัญชีประเภทใดครับ?' },
    { order: 2, emoji: '💸', text: 'โอนเงินไปไทย', keywords: 'โอน,transfer,ส่งเงิน,thailand', autoResponse: 'สำหรับบริการโอนเงินไปไทย:\n- อัตราแลกเปลี่ยนวันนี้สามารถตรวจสอบได้ที่เว็บไซต์\n- ค่าธรรมเนียมเริ่มต้น xxx บาท\n\nต้องการข้อมูลเพิ่มเติมไหมครับ?' },
    { order: 3, emoji: '💳', text: 'บัตรเครดิต/เดบิต', keywords: 'บัตร,card,credit,debit', autoResponse: 'สำหรับบริการบัตร:\n- บัตรเดบิต: ฟรีค่าธรรมเนียมปีแรก\n- บัตรเครดิต: ต้องมีรายได้ขั้นต่ำ xxx บาท\n\nสนใจบัตรประเภทใดครับ?' },
    { order: 4, emoji: '💰', text: 'สินเชื่อ', keywords: 'สินเชื่อ,กู้,loan,เงินกู้', autoResponse: 'สำหรับบริการสินเชื่อ กรุณาให้ข้อมูลเบื้องต้น:\n- วงเงินที่ต้องการ\n- รายได้ต่อเดือน\n\nเจ้าหน้าที่จะติดต่อกลับภายใน 24 ชั่วโมงครับ' },
    { order: 5, emoji: '❓', text: 'อื่นๆ', keywords: '', autoResponse: 'กรุณาพิมพ์ข้อความที่ต้องการสอบถามได้เลยครับ' }
  ];

  const stmt = db.prepare(`
    INSERT INTO menu_options (order_num, emoji, text, keywords, auto_response)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const opt of defaultOptions) {
    stmt.run(opt.order, opt.emoji, opt.text, opt.keywords, opt.autoResponse);
  }

  logger.info('Default menu options inserted');
}

/**
 * Get database instance
 */
function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase
};
