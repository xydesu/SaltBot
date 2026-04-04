const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'saltbot.db');

// Ensure the data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables on first run
db.exec(`
    CREATE TABLE IF NOT EXISTS user_prefs (
        user_id TEXT PRIMARY KEY,
        server  TEXT NOT NULL DEFAULT 'INT'
    );
`);

/**
 * 取得用戶的主要伺服器偏好（預設 'INT'）
 * @param {string} userId Discord 用戶 ID
 * @returns {'INT'|'JP'}
 */
function getServer(userId) {
    const row = db.prepare('SELECT server FROM user_prefs WHERE user_id = ?').get(userId);
    return row ? row.server : 'INT';
}

/**
 * 設定用戶的主要伺服器偏好（永久儲存）
 * @param {string} userId Discord 用戶 ID
 * @param {'INT'|'JP'} server
 */
function setServer(userId, server) {
    db.prepare(`
        INSERT INTO user_prefs (user_id, server)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET server = excluded.server
    `).run(userId, server);
}

module.exports = { getServer, setServer };
