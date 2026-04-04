const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { URL } = require('url');
const querystring = require('querystring');

const MAIMAI_BASE_URL_INT = 'https://maimaidx-eng.com/maimai-mobile/';
const MAIMAI_BASE_URL_JP  = 'https://maimaidx.jp/maimai-mobile/';
const SEGA_AUTH_HOST = 'lng-tgk-aime-gw.am-all.net';
const SEGA_AUTH_PATH = '/common_auth/login';
const SEGA_AUTH_POST_PATH = '/common_auth/login/sid';
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
            const encoding = (res.headers['content-encoding'] || '').toLowerCase();
            let stream = res;
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            } else if (encoding === 'br') {
                stream = res.pipe(zlib.createBrotliDecompress());
            }

            let data = '';
            stream.on('data', chunk => { data += chunk; });
            stream.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data,
                });
            });
            stream.on('error', (err) => {
                reject(err);
            });
        });

        req.on('error', (err) => {
            reject(err);
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('請求超時'));
        });

        if (body) req.write(body);
        req.end();
    });
}

/**
 * 判斷回應是否為 SEGA 登入頁面。
 * 同時檢查最終 URL（空 body 時 SEGA 伺服器仍回傳 200，導致 body 判斷失效）
 * 和 HTML 內容，避免誤判。
 * @param {string} html
 * @param {string} [finalUrl]
 * @returns {boolean}
 */
function isSegaLoginPage(html, finalUrl = '') {
    // 若最終落點在 SEGA 認證主機，無論 body 是否為空皆視為登入頁
    try {
        if (finalUrl && new URL(finalUrl).hostname === SEGA_AUTH_HOST) return true;
    } catch { /* 忽略無效 URL */ }
    // 透過表單路徑或 SEGA ID 欄位名稱判斷
    return html.includes('common_auth/login') ||
        /name=["']sid["']/.test(html);
}

class MaimaiSession {
    /**
     * @param {string} [baseUrl] maimai-mobile 基底 URL（預設為國際版）
     */
    constructor(baseUrl = MAIMAI_BASE_URL_INT) {
        this._baseUrl = baseUrl;
        /** @type {Record<string, string>} */
        this._cookies = {};
        this._loggedIn = false;
        this._loginTime = 0;
        /** @type {Promise<void>|null} */
        this._loginPromise = null;
        /** @type {string|null} stored for automatic re-login (in-memory only, cleared on clearSession) */
        this._segaId = null;
        /** @type {string|null} stored for automatic re-login (in-memory only, cleared on clearSession) */
        this._password = null;
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
                'Accept-Encoding': 'gzip, deflate, br',
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
            return { ...res, finalUrl: current };
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
     * 登入設定的 maimai DX 伺服器（國際版或日本版，取決於建構時傳入的 baseUrl）。
     * @param {string} [segaId] SEGA ID（省略時使用環境變數 MAIMAI_SEGA_ID）
     * @param {string} [password] 密碼（省略時使用環境變數 MAIMAI_PASSWORD）
     * @throws {Error} 若憑證未提供或登入失敗
     */
    async login(segaId, password) {
        segaId = segaId || process.env.MAIMAI_SEGA_ID;
        password = password || process.env.MAIMAI_PASSWORD;

        if (!segaId || !password) {
            throw new Error('未提供 SEGA 帳號或密碼にゃ');
        }

        this._loggedIn = false;
        this._cookies = {};
        // 儲存憑證供自動重新登入使用
        this._segaId = segaId;
        this._password = password;

        // 步驟 1：存取 maimai 首頁，取得 SEGA 認證重定向 URL
        console.log('[MaimaiSession] 正在存取 maimai DX 首頁にゃ…');
        const homeRes = await this._get(this._baseUrl);


        // 若已登入（狀態 200 且無重定向到 SEGA 認證），直接判定成功
        if (homeRes.statusCode === 200 && !isSegaLoginPage(homeRes.body, homeRes.finalUrl)) {
            this._loggedIn = true;
            this._loginTime = Date.now();
            console.log('[MaimaiSession] 已存在有效 Session にゃ');
            return;
        }

        // 步驟 2：取得 SEGA 登入表單
        // SEGA 認證伺服器首次 GET 固定回傳空 body（Session 建立），
        // 必須帶著 JSESSIONID 再次 GET 才能取得含表單的完整頁面。
        let authPageUrl;
        try {
            const finalUrlObj = new URL(homeRes.finalUrl);
            authPageUrl = finalUrlObj.hostname === SEGA_AUTH_HOST
                ? homeRes.finalUrl
                : `https://${SEGA_AUTH_HOST}${SEGA_AUTH_PATH}`;
        } catch {
            authPageUrl = `https://${SEGA_AUTH_HOST}${SEGA_AUTH_PATH}`;
        }
        console.log('[MaimaiSession] 正在取得 SEGA 登入表單にゃ…');
        const authRes = await this._get(authPageUrl);
        if (authRes.finalUrl) authPageUrl = authRes.finalUrl;

        // 步驟 3：POST 憑證到 SEGA 登入端點
        // 表單 action="/common_auth/login/sid"，欄位為 sid / password / retention
        const postUrl = `https://${SEGA_AUTH_HOST}${SEGA_AUTH_POST_PATH}`;
        console.log('[MaimaiSession] 正在提交 SEGA ID 憑證にゃ…');
        const postRes = await this._post(postUrl, {
            sid: segaId,
            password,
            retention: '1',
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
        const verifyRes = await this._get(this._baseUrl);


        if (verifyRes.statusCode !== 200) {
            throw new Error(`登入驗證失敗，狀態碼: ${verifyRes.statusCode}`);
        }

        // 若頁面仍要求登入則視為失敗
        if (isSegaLoginPage(verifyRes.body, verifyRes.finalUrl)) {
            throw new Error('帳號或密碼錯誤，登入 maimai DX 失敗にゃ');
        }

        this._loggedIn = true;
        this._loginTime = Date.now();
        console.log('[MaimaiSession] 成功登入 maimai DX にゃ！');
    }

    /**
     * 確保 Session 有效（若未登入或已過期則使用已儲存的憑證重新登入）。
     * 此方法為執行緒安全的（防止同時多次登入）。
     */
    async ensureSession() {
        const sessionExpired = Date.now() - this._loginTime > SESSION_LIFETIME_MS;

        if (this._loggedIn && !sessionExpired) return;

        // 防止同時多次登入
        if (this._loginPromise) {
            return this._loginPromise;
        }

        this._loginPromise = this.login(this._segaId, this._password).finally(() => {
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
        const url = new URL(path, this._baseUrl).toString();
        const res = await this._get(url);


        // 若被重定向到登入頁，嘗試重新登入一次
        if (isSegaLoginPage(res.body, res.finalUrl)) {
            console.log('[MaimaiSession] Session 已過期，重新登入にゃ…');
            this._loggedIn = false;
            await this.ensureSession();
            const retryRes = await this._get(url);
            // 若重新登入後仍無法存取，拋出錯誤
            if (isSegaLoginPage(retryRes.body, retryRes.finalUrl)) {
                throw new Error('Session 過期且自動重新登入失敗，請重新執行 /maimai-login にゃ');
            }
            return retryRes;
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
     * 清除目前 Session（登出），同時清除儲存的憑證
     */
    clearSession() {
        this._cookies = {};
        this._loggedIn = false;
        this._loginTime = 0;
        this._segaId = null;
        this._password = null;
    }
}

// 匯出單例實例（預設使用國際版環境變數），同時匯出類別及 URL 常數
module.exports = new MaimaiSession(MAIMAI_BASE_URL_INT);
module.exports.MaimaiSession = MaimaiSession;
module.exports.MAIMAI_BASE_URL_INT = MAIMAI_BASE_URL_INT;
module.exports.MAIMAI_BASE_URL_JP  = MAIMAI_BASE_URL_JP;
