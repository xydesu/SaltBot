const https = require('https');
const http = require('http');
const { URL } = require('url');
const querystring = require('querystring');

const MAIMAI_BASE_URL = 'https://maimaidx-eng.com/maimai-mobile/';
const SEGA_AUTH_HOST = 'lng-tgk-aime-gw.am-all.net';
const SEGA_AUTH_PATH = '/common_auth/login';
const LOGIN_TIMEOUT_MS = 15000;
const SESSION_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

/**
 * 解析 Set-Cookie 標頭，回傳 { name, value, ...attrs } 的陣列
 * @param {string[]} headers
 * @returns {{ name: string, value: string }[]}
 */
function parseSetCookieHeaders(headers) {
    if (!headers) return [];
    const list = Array.isArray(headers) ? headers : [headers];
    return list.map(header => {
        const parts = header.split(';').map(s => s.trim());
        const [nameValue] = parts;
        const eqIdx = nameValue.indexOf('=');
        if (eqIdx === -1) return null;
        return {
            name: nameValue.slice(0, eqIdx).trim(),
            value: nameValue.slice(eqIdx + 1).trim(),
        };
    }).filter(Boolean);
}

/**
 * 從 HTML 中萃取 <input> 隱藏欄位的值
 * @param {string} html
 * @param {string} name
 * @returns {string|null}
 */
function extractInputValue(html, name) {
    const re = new RegExp(`<input[^>]+name=["']${name}["'][^>]+value=["']([^"']*)["']`, 'i');
    const m = re.exec(html);
    if (m) return m[1];
    // 嘗試 value 在 name 之前的情況
    const re2 = new RegExp(`<input[^>]+value=["']([^"']*)["'][^>]+name=["']${name}["']`, 'i');
    const m2 = re2.exec(html);
    return m2 ? m2[1] : null;
}

/**
 * 以 Promise 包裝的 HTTP/HTTPS 請求（不自動跟隨重定向）
 * @param {string|URL} urlOrString
 * @param {object} options
 * @param {string|null} body
 * @returns {Promise<{ statusCode: number, headers: object, body: string }>}
 */
function rawRequest(urlOrString, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        const url = typeof urlOrString === 'string' ? new URL(urlOrString) : urlOrString;
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;

        const reqOptions = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: LOGIN_TIMEOUT_MS,
        };

        const req = lib.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: data,
            }));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('請求超時'));
        });

        if (body) req.write(body);
        req.end();
    });
}

class MaimaiSession {
    constructor() {
        /** @type {Record<string, string>} */
        this._cookies = {};
        this._loggedIn = false;
        this._loginTime = 0;
        /** @type {Promise<void>|null} */
        this._loginPromise = null;
    }

    // ── Cookie 管理 ───────────────────────────────────────────────

    _storeCookies(setCookieHeaders) {
        for (const c of parseSetCookieHeaders(setCookieHeaders)) {
            this._cookies[c.name] = c.value;
        }
    }

    _cookieHeader() {
        return Object.entries(this._cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    // ── 帶 Cookie 的 GET 請求（自動跟隨重定向） ───────────────────

    async _get(url, extraHeaders = {}) {
        let current = typeof url === 'string' ? url : url.toString();
        let redirects = 0;
        const MAX_REDIRECTS = 10;

        while (redirects < MAX_REDIRECTS) {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                ...extraHeaders,
            };
            if (Object.keys(this._cookies).length > 0) {
                headers['Cookie'] = this._cookieHeader();
            }

            const res = await rawRequest(current, { method: 'GET', headers });
            this._storeCookies(res.headers['set-cookie']);

            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const next = new URL(res.headers.location, current).toString();
                current = next;
                redirects++;
                continue;
            }
            return res;
        }
        throw new Error('超過最大重定向次數');
    }

    // ── POST 表單（不跟隨重定向，回傳原始 response） ─────────────

    async _post(url, formData, extraHeaders = {}) {
        const body = querystring.stringify(formData);
        const urlObj = new URL(url);
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body).toString(),
            'Referer': url,
            'Origin': `${urlObj.protocol}//${urlObj.host}`,
            ...extraHeaders,
        };
        if (Object.keys(this._cookies).length > 0) {
            headers['Cookie'] = this._cookieHeader();
        }

        const res = await rawRequest(url, { method: 'POST', headers }, body);
        this._storeCookies(res.headers['set-cookie']);
        return res;
    }

    // ── 登入流程 ──────────────────────────────────────────────────

    /**
     * 登入 maimaidx-eng.com。
     * 使用環境變數 MAIMAI_SEGA_ID 和 MAIMAI_PASSWORD。
     * @throws {Error} 若憑證未設定或登入失敗
     */
    async login() {
        const segaId = process.env.MAIMAI_SEGA_ID;
        const password = process.env.MAIMAI_PASSWORD;

        if (!segaId || !password) {
            throw new Error('MAIMAI_SEGA_ID 或 MAIMAI_PASSWORD 環境變數未設定にゃ');
        }

        this._loggedIn = false;
        this._cookies = {};

        // 步驟 1：存取 maimai 首頁，取得 SEGA 認證重定向 URL
        console.log('[MaimaiSession] 正在存取 maimai DX 首頁にゃ…');
        const homeRes = await this._get(MAIMAI_BASE_URL);

        // 若已登入（狀態 200 且無重定向到 SEGA 認證），直接判定成功
        if (homeRes.statusCode === 200 && !homeRes.body.includes('segaId')) {
            this._loggedIn = true;
            this._loginTime = Date.now();
            console.log('[MaimaiSession] 已存在有效 Session にゃ');
            return;
        }

        // 步驟 2：取得 SEGA 認證頁面（_get 已自動跟隨重定向）
        // 此時 homeRes 應已是 SEGA 認證頁面的內容
        let authPageHtml = homeRes.body;
        let authPageUrl = `https://${SEGA_AUTH_HOST}${SEGA_AUTH_PATH}`;

        // 若 _get 最終停在 SEGA 認證頁面，萃取 token 等隱藏欄位
        const token = extractInputValue(authPageHtml, 'token');

        if (!token) {
            // 重新取得認證頁面（可能 homeRes 不是 SEGA 登入頁）
            console.log('[MaimaiSession] 嘗試直接存取 SEGA 認證頁面にゃ…');
            const authRes = await this._get(authPageUrl);
            authPageHtml = authRes.body;
        }

        const csrfToken = extractInputValue(authPageHtml, 'token') || '';

        // 步驟 3：POST 憑證到 SEGA 認證端點
        console.log('[MaimaiSession] 正在提交 SEGA ID 憑證にゃ…');
        const postRes = await this._post(authPageUrl, {
            segaId,
            password,
            token: csrfToken,
        });

        // 步驟 4：跟隨登入後的重定向回 maimai
        if (postRes.statusCode >= 300 && postRes.statusCode < 400 && postRes.headers.location) {
            console.log('[MaimaiSession] 跟隨登入後重定向にゃ…');
            await this._get(postRes.headers.location);
        } else if (postRes.statusCode !== 200) {
            throw new Error(`SEGA 認證回應非預期狀態碼: ${postRes.statusCode}`);
        }

        // 步驟 5：驗證登入狀態
        console.log('[MaimaiSession] 驗證登入狀態にゃ…');
        const verifyRes = await this._get(MAIMAI_BASE_URL);

        if (verifyRes.statusCode !== 200) {
            throw new Error(`登入驗證失敗，狀態碼: ${verifyRes.statusCode}`);
        }

        // 若頁面仍要求登入則視為失敗
        if (verifyRes.body.includes('common_auth/login') || verifyRes.body.includes('segaId')) {
            throw new Error('帳號或密碼錯誤，登入 maimai DX 失敗にゃ');
        }

        this._loggedIn = true;
        this._loginTime = Date.now();
        console.log('[MaimaiSession] 成功登入 maimai DX にゃ！');
    }

    /**
     * 確保 Session 有效（若未登入或已過期則重新登入）。
     * 此方法為執行緒安全的（防止同時多次登入）。
     */
    async ensureSession() {
        const sessionExpired = Date.now() - this._loginTime > SESSION_LIFETIME_MS;

        if (this._loggedIn && !sessionExpired) return;

        // 防止同時多次登入
        if (this._loginPromise) {
            return this._loginPromise;
        }

        this._loginPromise = this.login().finally(() => {
            this._loginPromise = null;
        });

        return this._loginPromise;
    }

    /**
     * 以已認證的 Session 發出 GET 請求。
     * @param {string} path maimai-mobile 下的路徑（例如 'home/'）
     * @returns {Promise<{ statusCode: number, headers: object, body: string }>}
     */
    async authenticatedGet(path) {
        await this.ensureSession();
        const url = new URL(path, MAIMAI_BASE_URL).toString();
        const res = await this._get(url);

        // 若被重定向到登入頁，嘗試重新登入一次
        if (res.body.includes('common_auth/login') || res.body.includes('segaId')) {
            console.log('[MaimaiSession] Session 已過期，重新登入にゃ…');
            this._loggedIn = false;
            await this.ensureSession();
            return this._get(url);
        }

        return res;
    }

    /**
     * 取得目前登入狀態
     * @returns {{ loggedIn: boolean, loginTime: number|null }}
     */
    getStatus() {
        return {
            loggedIn: this._loggedIn,
            loginTime: this._loggedIn ? this._loginTime : null,
        };
    }

    /**
     * 清除目前 Session（登出）
     */
    clearSession() {
        this._cookies = {};
        this._loggedIn = false;
        this._loginTime = 0;
    }
}

module.exports = new MaimaiSession();
