const { MaimaiSession, MAIMAI_BASE_URL_INT, MAIMAI_BASE_URL_JP } = require('./maimaiSession');
const db = require('./database');

/**
 * 每位 Discord 用戶各自的 maimai DX Session 管理器。
 * 伺服器偏好永久儲存於 SQLite；Session（Cookie）僅存於記憶體。
 *
 * 由於國際版與日本版共用相同的 SEGA 帳號密碼，
 * 登入時會同時對兩個伺服器進行認證。
 */
class UserSessionStore {
    constructor() {
        /** @type {Map<string, MaimaiSession>} 國際版 sessions */
        this._intSessions = new Map();
        /** @type {Map<string, MaimaiSession>} 日本版 sessions */
        this._jpSessions = new Map();
    }

    // ── 伺服器偏好（SQLite 永久儲存） ─────────────────────────────

    /**
     * 設定用戶的主要伺服器偏好並寫入資料庫
     * @param {string} userId Discord 用戶 ID
     * @param {'INT'|'JP'} server
     */
    setServer(userId, server) {
        db.setServer(userId, server);
    }

    /**
     * 取得用戶的主要伺服器偏好（預設為 'INT'）
     * @param {string} userId Discord 用戶 ID
     * @returns {'INT'|'JP'}
     */
    getServer(userId) {
        return db.getServer(userId);
    }

    // ── Session 管理 ──────────────────────────────────────────────

    /**
     * 取得或建立指定用戶的 Session 實例。
     * 若未指定伺服器，使用該用戶的主要伺服器偏好。
     * @param {string} userId Discord 用戶 ID
     * @param {'INT'|'JP'} [server] 指定伺服器（省略時使用偏好）
     * @returns {MaimaiSession}
     */
    getSession(userId, server = null) {
        const srv = server || this.getServer(userId);
        if (srv === 'JP') {
            if (!this._jpSessions.has(userId)) {
                this._jpSessions.set(userId, new MaimaiSession(MAIMAI_BASE_URL_JP));
            }
            return this._jpSessions.get(userId);
        }
        if (!this._intSessions.has(userId)) {
            this._intSessions.set(userId, new MaimaiSession(MAIMAI_BASE_URL_INT));
        }
        return this._intSessions.get(userId);
    }

    /**
     * 以相同的 SEGA 憑證同時登入國際版與日本版。
     * @param {string} userId Discord 用戶 ID
     * @param {string} segaId SEGA ID
     * @param {string} password SEGA 密碼
     * @returns {Promise<{ int: Error|null, jp: Error|null }>} 各伺服器的登入錯誤（null 表示成功）
     */
    async loginBoth(userId, segaId, password) {
        const intSession = this.getSession(userId, 'INT');
        const jpSession  = this.getSession(userId, 'JP');

        const [intErr, jpErr] = await Promise.all([
            intSession.login(segaId, password).then(() => null).catch(e => e),
            jpSession.login(segaId, password).then(() => null).catch(e => e),
        ]);

        return { int: intErr, jp: jpErr };
    }

    /**
     * 指定用戶是否已登入（檢查其主要伺服器的 Session）
     * @param {string} userId Discord 用戶 ID
     * @returns {boolean}
     */
    isLoggedIn(userId) {
        const srv = this.getServer(userId);
        const session = srv === 'JP'
            ? this._jpSessions.get(userId)
            : this._intSessions.get(userId);
        return session ? session.getStatus().loggedIn : false;
    }

    /**
     * 清除用戶的所有 Session（兩個伺服器均登出）
     * @param {string} userId Discord 用戶 ID
     */
    removeSession(userId) {
        const intSession = this._intSessions.get(userId);
        if (intSession) { intSession.clearSession(); this._intSessions.delete(userId); }
        const jpSession = this._jpSessions.get(userId);
        if (jpSession)  { jpSession.clearSession();  this._jpSessions.delete(userId); }
    }

    // ── 已儲存的帳號密碼（SQLite 永久儲存） ──────────────────────

    /**
     * 用戶是否有儲存的帳號密碼（可用於自動登入）
     * @param {string} userId Discord 用戶 ID
     * @returns {boolean}
     */
    hasAutoLogin(userId) {
        return db.hasCredentials(userId);
    }

    /**
     * 使用已儲存的帳號密碼同時登入兩個伺服器
     * @param {string} userId Discord 用戶 ID
     * @returns {Promise<{ int: Error|null, jp: Error|null }>}
     */
    async loginWithSaved(userId) {
        const creds = db.loadCredentials(userId);
        if (!creds) throw new Error('找不到已儲存的帳號資料にゃ');
        return this.loginBoth(userId, creds.segaId, creds.password);
    }

    /**
     * 刪除用戶已儲存的帳號密碼
     * @param {string} userId Discord 用戶 ID
     */
    deleteAutoLogin(userId) {
        db.deleteCredentials(userId);
    }
}

module.exports = new UserSessionStore();

