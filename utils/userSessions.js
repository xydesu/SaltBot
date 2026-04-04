const { MaimaiSession } = require('./maimaiSession');

/**
 * 每位 Discord 用戶各自的 maimai DX Session 管理器。
 * 以用戶 Discord ID 作為鍵，存儲其專屬的 MaimaiSession 實例。
 *
 * 注意：Session 僅存於記憶體中，機器人重啟後所有用戶需重新登入。
 */
class UserSessionStore {
    constructor() {
        /** @type {Map<string, MaimaiSession>} */
        this._sessions = new Map();
    }

    /**
     * 取得或建立指定用戶的 Session 實例
     * @param {string} userId Discord 用戶 ID
     * @returns {MaimaiSession}
     */
    getSession(userId) {
        if (!this._sessions.has(userId)) {
            this._sessions.set(userId, new MaimaiSession());
        }
        return this._sessions.get(userId);
    }

    /**
     * 指定用戶是否已登入
     * @param {string} userId Discord 用戶 ID
     * @returns {boolean}
     */
    isLoggedIn(userId) {
        const session = this._sessions.get(userId);
        return session ? session.getStatus().loggedIn : false;
    }

    /**
     * 移除指定用戶的 Session（登出）
     * @param {string} userId Discord 用戶 ID
     */
    removeSession(userId) {
        const session = this._sessions.get(userId);
        if (session) {
            session.clearSession();
            this._sessions.delete(userId);
        }
    }
}

module.exports = new UserSessionStore();
