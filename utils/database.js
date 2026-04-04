const Database = require('better-sqlite3');
const crypto = require('crypto');
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
    CREATE TABLE IF NOT EXISTS saved_credentials (
        user_id TEXT PRIMARY KEY,
        iv      TEXT NOT NULL,
        payload TEXT NOT NULL,
        tag     TEXT NOT NULL
    );
`);

// ── Encryption helpers (AES-256-GCM) ─────────────────────────────────────────

/**
 * Derive a 32-byte key from the ENCRYPTION_KEY env variable.
 * Falls back to DISCORD_TOKEN so the data is at least not stored plaintext.
 */
function _getKey() {
    const raw = process.env.ENCRYPTION_KEY || process.env.DISCORD_TOKEN || 'saltbot-fallback-key-please-set-ENCRYPTION_KEY';
    return crypto.createHash('sha256').update(raw).digest();
}

function _encrypt(text) {
    const key = _getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        iv:      iv.toString('base64'),
        payload: encrypted.toString('base64'),
        tag:     tag.toString('base64'),
    };
}

function _decrypt(iv, payload, tag) {
    const key = _getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload, 'base64')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}

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

// ── Credential storage ────────────────────────────────────────────────────────

/**
 * 安全儲存用戶的 SEGA 帳號密碼（AES-256-GCM 加密後存入 SQLite）
 * @param {string} userId   Discord 用戶 ID
 * @param {string} segaId   SEGA ID
 * @param {string} password SEGA 密碼
 */
function saveCredentials(userId, segaId, password) {
    const plaintext = JSON.stringify({ segaId, password });
    const { iv, payload, tag } = _encrypt(plaintext);
    db.prepare(`
        INSERT INTO saved_credentials (user_id, iv, payload, tag)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            iv      = excluded.iv,
            payload = excluded.payload,
            tag     = excluded.tag
    `).run(userId, iv, payload, tag);
}

/**
 * 讀取用戶已儲存的 SEGA 帳號密碼
 * @param {string} userId Discord 用戶 ID
 * @returns {{ segaId: string, password: string }|null}
 */
function loadCredentials(userId) {
    const row = db.prepare('SELECT iv, payload, tag FROM saved_credentials WHERE user_id = ?').get(userId);
    if (!row) return null;
    try {
        return JSON.parse(_decrypt(row.iv, row.payload, row.tag));
    } catch {
        return null;
    }
}

/**
 * 刪除用戶已儲存的 SEGA 帳號密碼
 * @param {string} userId Discord 用戶 ID
 */
function deleteCredentials(userId) {
    db.prepare('DELETE FROM saved_credentials WHERE user_id = ?').run(userId);
}

/**
 * 檢查用戶是否有已儲存的 SEGA 帳號密碼
 * @param {string} userId Discord 用戶 ID
 * @returns {boolean}
 */
function hasCredentials(userId) {
    return !!db.prepare('SELECT 1 FROM saved_credentials WHERE user_id = ?').get(userId);
}

module.exports = { getServer, setServer, saveCredentials, loadCredentials, deleteCredentials, hasCredentials };
