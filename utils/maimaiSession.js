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
    } catch (e) {
        if (!(e instanceof TypeError)) throw e; // 非 URL 格式錯誤將重新拋出
    }
    // 透過表單路徑或 SEGA ID 欄位名稱判斷
    return html.includes('common_auth/login') ||
        /name=["']sid["']/.test(html);
}

/**
 * 判斷回應是否為 JP 原生登入表單頁面。
 * JP 伺服器的登入頁不重定向到 SEGA 認證主機，而是在相同網域顯示含
 * `segaId` 欄位的登入表單，必須與 isSegaLoginPage 分開處理。
 * 注意：只用 segaId 欄位判斷，不使用 token 欄位，因為 token 亦存在於
 * 已認證頁面的 CSRF 防護表單中，會造成誤判。
 * @param {string} html
 * @returns {boolean}
 */
function isJPLoginPage(html) {
    // segaId 輸入欄位僅出現在 JP 登入表單頁面，已認證頁面不含此欄位
    return /name=["']segaId["']/.test(html);
}

/**
 * 判斷回應是否為 maimai 錯誤頁面。
 * 當使用過期或無效的 Session 存取受保護頁面時，JP 與 INT 伺服器
 * 有時會重定向到 /error/ 並回傳 HTTP 200，需額外偵測。
 * @param {string} [finalUrl]
 * @returns {boolean}
 */
function isErrorPage(finalUrl = '') {
    try {
        return new URL(finalUrl).pathname.includes('/error');
    } catch (e) {
        if (!(e instanceof TypeError)) throw e; // 非 URL 格式錯誤將重新拋出
    }
    return false;
}

/**
 * 判斷回應是否為 maimai Aime 選擇頁面。
 * @param {string} html
 * @param {string} [finalUrl]
 * @returns {boolean}
 */
function isAimeListPage(html, finalUrl = '') {
    try {
        if (finalUrl && new URL(finalUrl).pathname.includes('aimeList')) return true;
    } catch (e) {
        if (!(e instanceof TypeError)) throw e; // 非 URL 格式錯誤將重新拋出
    }
    return html.includes('aimeList/submit') && html.includes('idx=');
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

    // ── 伺服器類型判斷 ────────────────────────────────────────────

    /** @returns {boolean} 是否為日本版伺服器 */
    get _isJP() {
        return this._baseUrl.includes('maimaidx.jp');
    }

    // ── Aime 卡片選擇 ─────────────────────────────────────────────

    /**
     * 選擇 Aime 卡片（索引 0 = 第一張）。
     * JP 伺服器登入後必須呼叫此步驟，否則後續所有請求都會停留在選卡頁面。
     * @param {number} [idx=0]
     */
    async _selectAime(idx = 0) {
        const aimeUrl = new URL(`aimeList/submit/?idx=${idx}`, this._baseUrl).toString();
        const serverLabel = this._isJP ? 'JP' : 'INT';
        console.log(`[MaimaiSession][${serverLabel}] Aime 選卡: GET ${aimeUrl}`);
        try {
            const res = await this._get(aimeUrl);
            console.log(`[MaimaiSession][${serverLabel}] Aime 選卡結果: statusCode=${res.statusCode}, finalUrl=${res.finalUrl}, bodyLength=${res.body.length}`);
            return res;
        } catch (err) {
            // Aime 選卡失敗屬非致命錯誤：若伺服器已預設選好卡片則可能不存在選卡頁面。
            // 後續 authenticatedGet 會在偵測到選卡頁面時再次嘗試。
            console.warn(`[MaimaiSession][${serverLabel}] Aime 選卡警告 (非致命，後續請求將自動重試): ${err.message}`);
        }
    }

    // ── 登入流程 ──────────────────────────────────────────────────

    /**
     * 登入設定的 maimai DX 伺服器（國際版或日本版，取決於建構時傳入的 baseUrl）。
     * JP 版使用直接的 token 表單登入（POST /submit/），之後必須選擇 Aime 卡片。
     * INT 版透過 SEGA 共同認證閘道器登入。
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

        const serverLabel = this._isJP ? 'JP' : 'INT';
        console.log(`[MaimaiSession][${serverLabel}] ====== 開始登入 ====== baseUrl=${this._baseUrl}`);

        // 步驟 1：存取 maimai 首頁，取得重定向目標或直接登入表單
        console.log(`[MaimaiSession][${serverLabel}] 步驟 1: 存取 maimai DX 首頁にゃ…`);
        const homeRes = await this._get(this._baseUrl);
        console.log(`[MaimaiSession][${serverLabel}] 步驟 1 結果: statusCode=${homeRes.statusCode}, finalUrl=${homeRes.finalUrl}, bodyLength=${homeRes.body.length}`);
        console.log(`[MaimaiSession][${serverLabel}] 目前 Cookies: ${Object.keys(this._cookies).join(', ') || '(無)'}`);

        // 若已登入（狀態 200 且無重定向到任何登入頁），直接判定成功
        const looksLikeLoginPage = isSegaLoginPage(homeRes.body, homeRes.finalUrl)
            || (this._isJP && isJPLoginPage(homeRes.body));
        if (homeRes.statusCode === 200 && !looksLikeLoginPage) {
            this._loggedIn = true;
            this._loginTime = Date.now();
            console.log(`[MaimaiSession][${serverLabel}] 已存在有效 Session にゃ`);
            return;
        }
        console.log(`[MaimaiSession][${serverLabel}] 偵測到登入頁面，需要重新登入にゃ…`);

        // ── JP 伺服器：使用直接 token 表單登入 ──────────────────
        if (this._isJP) {
            // JP 首頁（或其登入頁）通常內嵌 token 欄位，直接 POST 到 /submit/
            const token = homeRes.body.match(/name="token" value="([^"]+)"/)?.[1];
            console.log(`[MaimaiSession][JP] 首頁 token: ${token ? '已找到' : '未找到'}`);
            console.log(`[MaimaiSession][JP] 首頁 body 前 300 字元: ${homeRes.body.substring(0, 300).replace(/\n/g, ' ')}`);

            // 若最終落到 SEGA 認證主機，代表 JP 這次也走 SEGA auth 流程，跳到下方通用邏輯
            let finalHostIsSegaAuth = false;
            try {
                finalHostIsSegaAuth = new URL(homeRes.finalUrl || '').hostname === SEGA_AUTH_HOST;
            } catch (e) {
                if (!(e instanceof TypeError)) throw e; // 非 URL 格式錯誤將重新拋出
            }

            if (!finalHostIsSegaAuth && token) {
                // JP 直接登入流程（token-based）
                const submitUrl = new URL('submit/', this._baseUrl).toString();
                console.log(`[MaimaiSession][JP] 步驟 2 (直接登入): POST 到 ${submitUrl}`);
                const postRes = await this._post(submitUrl, {
                    segaId,
                    password,
                    token,
                });
                console.log(`[MaimaiSession][JP] POST 結果: statusCode=${postRes.statusCode}, Location=${postRes.headers.location || '無'}`);
                console.log(`[MaimaiSession][JP] POST 後 Cookies: ${Object.keys(this._cookies).join(', ') || '(無)'}`);

                if (postRes.statusCode >= 300 && postRes.statusCode < 400 && postRes.headers.location) {
                    console.log(`[MaimaiSession][JP] 步驟 3: 跟隨重定向 ${postRes.headers.location}`);
                    const redirectRes = await this._get(postRes.headers.location);
                    console.log(`[MaimaiSession][JP] 重定向後: statusCode=${redirectRes.statusCode}, finalUrl=${redirectRes.finalUrl}, bodyLength=${redirectRes.body.length}`);
                } else if (postRes.statusCode !== 200) {
                    throw new Error(`JP 登入 POST 回應非預期狀態碼: ${postRes.statusCode}`);
                }

                // 步驟 4 (JP)：選擇 Aime 卡片——JP 伺服器此步驟不可省略
                console.log(`[MaimaiSession][JP] 步驟 4: 選擇 Aime 卡片にゃ…`);
                await this._selectAime();

                // 步驟 5 (JP)：驗證登入狀態
                console.log(`[MaimaiSession][JP] 步驟 5: 驗證登入狀態にゃ…`);
                const verifyRes = await this._get(this._baseUrl);
                console.log(`[MaimaiSession][JP] 驗證結果: statusCode=${verifyRes.statusCode}, finalUrl=${verifyRes.finalUrl}, bodyLength=${verifyRes.body.length}`);
                console.log(`[MaimaiSession][JP] 是否仍為登入頁: ${isSegaLoginPage(verifyRes.body, verifyRes.finalUrl) || isJPLoginPage(verifyRes.body)}`);
                console.log(`[MaimaiSession][JP] 是否為 Aime 選卡頁: ${isAimeListPage(verifyRes.body, verifyRes.finalUrl)}`);
                console.log(`[MaimaiSession][JP] 是否為錯誤頁: ${isErrorPage(verifyRes.finalUrl)}`);

                if (verifyRes.statusCode !== 200 || isSegaLoginPage(verifyRes.body, verifyRes.finalUrl) || isJPLoginPage(verifyRes.body) || isErrorPage(verifyRes.finalUrl)) {
                    throw new Error('帳號或密碼錯誤，登入 maimai DX JP 失敗にゃ');
                }

                this._loggedIn = true;
                this._loginTime = Date.now();
                console.log(`[MaimaiSession][JP] ====== 成功登入 maimai DX JP にゃ！ ======`);
                return;
            }

            // 若 JP 被重定向到 SEGA auth，記錄後繼續走通用 SEGA auth 流程
            console.log(`[MaimaiSession][JP] 首頁重定向到 SEGA 認證或未找到 token，改用 SEGA 認證流程にゃ…`);
        }

        // ── 通用 SEGA 認證流程（INT，以及被重定向到 SEGA auth 的 JP）──

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
        console.log(`[MaimaiSession][${serverLabel}] 步驟 2: 取得 SEGA 登入表單にゃ… authPageUrl=${authPageUrl}`);
        const authRes = await this._get(authPageUrl);
        if (authRes.finalUrl) authPageUrl = authRes.finalUrl;
        console.log(`[MaimaiSession][${serverLabel}] SEGA 表單回應: statusCode=${authRes.statusCode}, finalUrl=${authRes.finalUrl}, bodyLength=${authRes.body.length}`);
        console.log(`[MaimaiSession][${serverLabel}] 認證頁 Cookies: ${Object.keys(this._cookies).join(', ') || '(無)'}`);

        // 步驟 3：POST 憑證到 SEGA 登入端點
        // 表單 action="/common_auth/login/sid"，欄位為 sid / password / retention
        const postUrl = `https://${SEGA_AUTH_HOST}${SEGA_AUTH_POST_PATH}`;
        console.log(`[MaimaiSession][${serverLabel}] 步驟 3: POST 憑證到 ${postUrl}にゃ…`);
        const postRes = await this._post(postUrl, {
            sid: segaId,
            password,
            retention: '1',
        });
        console.log(`[MaimaiSession][${serverLabel}] POST 結果: statusCode=${postRes.statusCode}, Location=${postRes.headers.location || '無'}`);
        console.log(`[MaimaiSession][${serverLabel}] POST 後 Cookies: ${Object.keys(this._cookies).join(', ') || '(無)'}`);

        // 步驟 4：跟隨登入後的重定向回 maimai
        if (postRes.statusCode >= 300 && postRes.statusCode < 400 && postRes.headers.location) {
            console.log(`[MaimaiSession][${serverLabel}] 步驟 4: 跟隨登入後重定向にゃ… ${postRes.headers.location}`);
            const redirectRes = await this._get(postRes.headers.location);
            console.log(`[MaimaiSession][${serverLabel}] 重定向後: statusCode=${redirectRes.statusCode}, finalUrl=${redirectRes.finalUrl}, bodyLength=${redirectRes.body.length}`);
        } else if (postRes.statusCode !== 200) {
            throw new Error(`SEGA 認證回應非預期狀態碼: ${postRes.statusCode}`);
        }

        // JP：SEGA auth 流程結束後同樣需要選擇 Aime 卡片
        if (this._isJP) {
            console.log(`[MaimaiSession][JP] SEGA 認證後選擇 Aime 卡片にゃ…`);
            await this._selectAime();
        }

        // 步驟 5：驗證登入狀態
        console.log(`[MaimaiSession][${serverLabel}] 步驟 5: 驗證登入狀態にゃ…`);
        const verifyRes = await this._get(this._baseUrl);
        console.log(`[MaimaiSession][${serverLabel}] 驗證結果: statusCode=${verifyRes.statusCode}, finalUrl=${verifyRes.finalUrl}, bodyLength=${verifyRes.body.length}`);
        console.log(`[MaimaiSession][${serverLabel}] 是否仍為登入頁: ${isSegaLoginPage(verifyRes.body, verifyRes.finalUrl) || (this._isJP && isJPLoginPage(verifyRes.body))}`);
        console.log(`[MaimaiSession][${serverLabel}] 是否為 Aime 選卡頁: ${isAimeListPage(verifyRes.body, verifyRes.finalUrl)}`);
        console.log(`[MaimaiSession][${serverLabel}] 是否為錯誤頁: ${isErrorPage(verifyRes.finalUrl)}`);

        if (verifyRes.statusCode !== 200) {
            throw new Error(`登入驗證失敗，狀態碼: ${verifyRes.statusCode}`);
        }

        // 若頁面仍要求登入則視為失敗
        if (isSegaLoginPage(verifyRes.body, verifyRes.finalUrl) || (this._isJP && isJPLoginPage(verifyRes.body))) {
            throw new Error('帳號或密碼錯誤，登入 maimai DX 失敗にゃ');
        }

        this._loggedIn = true;
        this._loginTime = Date.now();
        console.log(`[MaimaiSession][${serverLabel}] ====== 成功登入 maimai DX にゃ！ ======`);
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
        const serverLabel = this._isJP ? 'JP' : 'INT';
        console.log(`[MaimaiSession][${serverLabel}] authenticatedGet: GET ${url}`);
        const res = await this._get(url);
        console.log(`[MaimaiSession][${serverLabel}] authenticatedGet 回應: statusCode=${res.statusCode}, finalUrl=${res.finalUrl}, bodyLength=${res.body.length}`);

        // 若被重定向到 Aime 選卡頁，選卡後重試（JP 伺服器 Session 過期時常見）
        if (isAimeListPage(res.body, res.finalUrl)) {
            console.log(`[MaimaiSession][${serverLabel}] 偵測到 Aime 選卡頁，重新選卡後重試にゃ…`);
            await this._selectAime();
            const retryRes = await this._get(url);
            console.log(`[MaimaiSession][${serverLabel}] 重試結果: statusCode=${retryRes.statusCode}, finalUrl=${retryRes.finalUrl}, bodyLength=${retryRes.body.length}`);
            return retryRes;
        }

        // 若被重定向到錯誤頁或登入頁，強制重新登入後重試一次
        const needsRelogin = isErrorPage(res.finalUrl)
            || isSegaLoginPage(res.body, res.finalUrl)
            || (this._isJP && isJPLoginPage(res.body));
        if (needsRelogin) {
            console.log(`[MaimaiSession][${serverLabel}] 偵測到錯誤/登入頁 (finalUrl=${res.finalUrl})，強制重新登入にゃ…`);
            this._loggedIn = false;
            await this.ensureSession();
            const retryRes = await this._get(url);
            console.log(`[MaimaiSession][${serverLabel}] 重新登入後重試結果: statusCode=${retryRes.statusCode}, finalUrl=${retryRes.finalUrl}, bodyLength=${retryRes.body.length}`);
            if (isErrorPage(retryRes.finalUrl) || isSegaLoginPage(retryRes.body, retryRes.finalUrl) || (this._isJP && isJPLoginPage(retryRes.body))) {
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
     * 取得目前已儲存的登入憑證（供儲存至資料庫使用）
     * @returns {{ segaId: string|null, password: string|null }}
     */
    getCredentials() {
        return { segaId: this._segaId, password: this._password };
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
