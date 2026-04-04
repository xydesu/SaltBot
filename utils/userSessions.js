const { MaimaiSession, MAIMAI_BASE_URL_INT, MAIMAI_BASE_URL_JP } = require('./maimaiSession');

/**
 * 每位 Discord 用戶各自的 maimai DX Session 管理器。
 * 以用戶 Discord ID 作為鍵，分別儲存國際版（INT）與日本版（JP）的 Session。
 * 並記錄每位用戶的主要伺服器偏好。
 *
 * 注意：Session 僅存於記憶體中，機器人重啟後所有用戶需重新登入。
 */
class UserSessionStore {
    constructor() {
        /** @type {Map<string, MaimaiSession>} 國際版 sessions */
        this._intSessions = new Map();
        /** @type {Map<string, MaimaiSession>} 日本版 sessions */
        this._jpSessions = new Map();
        /** @type {Map<string, 'INT'|'JP'>} 每位用戶的主要伺服器偏好 */
        this._serverPrefs = new Map();
    }

    /**
     * 設定用戶的主要伺服器偏好
     * @param {string} userId Discord 用戶 ID
     * @param {'INT'|'JP'} server
     */
    setServer(userId, server) {
        this._serverPrefs.set(userId, server);
    }

    /**
     * 取得用戶的主要伺服器偏好（預設為 'INT'）
     * @param {string} userId Discord 用戶 ID
     * @returns {'INT'|'JP'}
     */
    getServer(userId) {
        return this._serverPrefs.get(userId) || 'INT';
    }

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
     * 移除指定用戶的 Session（登出）。
     * 若未指定伺服器，移除其主要伺服器的 Session。
     * @param {string} userId Discord 用戶 ID
     * @param {'INT'|'JP'} [server] 指定伺服器（省略時使用偏好）
     */
    removeSession(userId, server = null) {
        const srv = server || this.getServer(userId);
        if (srv === 'JP') {
            const session = this._jpSessions.get(userId);
            if (session) {
                session.clearSession();
                this._jpSessions.delete(userId);
            }
        } else {
            const session = this._intSessions.get(userId);
            if (session) {
                session.clearSession();
                this._intSessions.delete(userId);
            }
        }
    }
}

module.exports = new UserSessionStore();
