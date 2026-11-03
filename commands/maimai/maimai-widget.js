const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ApplicationIntegrationType,
    InteractionContextType,
} = require('discord.js');
const userSessions = require('../../utils/userSessions');
const axios = require('axios');
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * 用 Session 下載 maimai DX 的頭像
 * @param {object} session
 * @param {string} avatarPath
 * @param {'INT'|'JP'} server
 * @returns {Promise<Buffer>}
 */
function downloadMaimaiAvatar(session, avatarPath, server) {
    return new Promise((resolve, reject) => {
        const isJP = server === 'JP';
        const baseUrl = isJP ? 'https://maimaidx.jp/maimai-mobile/' : 'https://maimaidx-eng.com/maimai-mobile/';
        const initialUrl = new URL(avatarPath, baseUrl).toString();

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': baseUrl + 'home/',
            'Cookie': session._cookieHeader()
        };

        const fetchWithRedirects = (currentUrl, redirectsLeft = 5) => {
            if (redirectsLeft <= 0) {
                return reject(new Error('下載頭像超過重定向次數上限'));
            }

            const parsed = new URL(currentUrl);
            const lib = parsed.protocol === 'https:' ? https : http;

            lib.get(currentUrl, { headers }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = new URL(res.headers.location, currentUrl).toString();
                    return fetchWithRedirects(redirectUrl, redirectsLeft - 1);
                }

                if (res.statusCode !== 200) {
                    return reject(new Error(`下載圖片失敗，狀態碼: ${res.statusCode}`));
                }

                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
                res.on('error', err => reject(err));
            }).on('error', err => reject(err));
        };

        fetchWithRedirects(initialUrl);
    });
}

/**
 * 上傳圖片至公開圖床以供 Discord Widget 讀取
 * 支援 ImgBB (若提供 IMGBB_API_KEY) 與 Catbox
 * @param {Buffer} buffer
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function uploadToImageHost(buffer, userId) {
    // 1. 優先嘗試 ImgBB (若環境變數已設定 IMGBB_API_KEY，永久穩定)
    if (process.env.IMGBB_API_KEY) {
        try {
            console.log('[maimai-widget] 正在使用 ImgBB 上傳頭像...');
            const formData = new FormData();
            formData.append('image', buffer.toString('base64'));
            formData.append('name', `avatar_${userId}`);
            const res = await axios.post(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, formData, { timeout: 15000 });
            if (res.data?.data?.url) {
                console.log(`[maimai-widget] 頭像成功託管至 ImgBB: ${res.data.data.url}`);
                return res.data.data.url;
            }
        } catch (err) {
            console.error('[maimai-widget] ImgBB 上傳失敗:', err.response?.data?.error?.message || err.message);
        }
    }

    // 2. 嘗試 Catbox 主站
    try {
        console.log('[maimai-widget] 嘗試上傳至 Catbox 主站...');
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        const blob = new Blob([buffer], { type: 'image/png' });
        formData.append('fileToUpload', blob, `avatar_${userId}.png`);

        const uploadRes = await axios.post('https://catbox.moe/user/api.php', formData, { timeout: 15000 });
        if (typeof uploadRes.data === 'string' && uploadRes.data.startsWith('http')) {
            const url = uploadRes.data.trim();
            console.log(`[maimai-widget] 頭像成功託管至 Catbox: ${url}`);
            return url;
        }
    } catch (err) {
        console.error('[maimai-widget] Catbox 上傳失敗:', err.response?.data || err.message);
    }

    return null;
}

// ── 伺服器標籤 ──────────────────────────────────────────────
const SERVER_LABELS = {
    INT: '🌏 國際版 (International)',
    JP:  '🇯🇵 日本版 (Japan)',
};

// ── 段位與階級對照表 ──────────────────────────────────────────
const DAN_MAP = {
    1: '一段', 2: '二段', 3: '三段', 4: '四段', 5: '五段',
    6: '六段', 7: '七段', 8: '八段', 9: '九段', 10: '十段',
    11: '真一段', 12: '真二段', 13: '真三段', 14: '真四段', 15: '真五段',
    16: '真六段', 17: '真七段', 18: '真八段', 19: '真九段', 20: '真十段',
    21: '真皆伝', 22: '裏皆伝'
};

const MATCHING_CLASS_MAP = {
    0: 'B5', 1: 'B4', 2: 'B3', 3: 'B2', 4: 'B1',
    5: 'A5', 6: 'A4', 7: 'A3', 8: 'A2', 9: 'A1',
    10: 'S5', 11: 'S4', 12: 'S3', 13: 'S2', 14: 'S1',
    15: 'SS5', 16: 'SS4', 17: 'SS3', 18: 'SS2', 19: 'SS1',
    20: 'SSS5', 21: 'SSS4', 22: 'SSS3', 23: 'SSS2', 24: 'SSS1',
    25: 'LEGEND'
};

/**
 * 移除所有 HTML 標籤
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
    let s = html;
    let prev;
    do { prev = s; s = s.replace(/<[^>]+>/g, ''); } while (s !== prev);
    return s.trim();
}

/**
 * 解碼 HTML 轉義字元
 * @param {string} str
 * @returns {string}
 */
function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'");
}

/**
 * 解析 playerData 網頁中的玩家資料
 * @param {string} html
 * @returns {object}
 */
function parsePlayerData(html) {
    const data = {};

    // 玩家名稱
    const nameMatch = html.match(/<div\s+class="name_block[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
    if (nameMatch) data.name = stripHtml(nameMatch[1]);

    // 稱號（Title）
    const trophyMatch = html.match(/<div\s+class="[^"]*trophy_inner_block[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || html.match(/<div\s+class="[^"]*trophy_block[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    
    if (trophyMatch) {
        data.title = decodeHtmlEntities(stripHtml(trophyMatch[1]));
    } else {
        const titleMatch = html.match(/<div\s+class="[^"]*title_block[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
        if (titleMatch) data.title = decodeHtmlEntities(stripHtml(titleMatch[1]));
    }

    // Rating
    const ratingMatch = html.match(/<div\s+class="[^"]*rating_block[^"]*"[^>]*>\s*([\d,]+)\s*<\/div>/i)
        || html.match(/class="[^"]*rating[^"]*"[^>]*>\s*([\d,]+)/i);
    if (ratingMatch) data.rating = ratingMatch[1].replace(/,/g, '');

    // 段位 (dans)
    const courseImgMatch = html.match(/course_rank_([a-zA-Z0-9_]+?)(?:\.png|\.gif|\.jpg|$)/i);
    if (courseImgMatch) {
        const courseId = courseImgMatch[1];
        const numMatch = courseId.match(/^([0-9]+)/);
        if (numMatch) {
            const num = parseInt(numMatch[1], 10);
            data.dans = DAN_MAP[num] || `段位 ${num}`;
        } else {
            data.dans = courseId.toUpperCase();
        }
    } else {
        data.dans = 'Not set';
    }

    // 階級 (classRank)
    const classImgMatch = html.match(/class_rank_([a-zA-Z0-9_]+?)(?:\.png|\.gif|\.jpg|$)/i);
    if (classImgMatch) {
        const classId = classImgMatch[1];
        const numMatch = classId.match(/_([0-9]+)/);
        if (numMatch) {
            const num = parseInt(numMatch[1], 10);
            data.classRank = MATCHING_CLASS_MAP[num] || `階級 ${num}`;
        } else {
            data.classRank = classId.toUpperCase();
        }
    } else {
        data.classRank = 'Not set';
    }

    // 優先解析總遊玩次數，如 total play count 或累計プレー回数
    const playCountMatch = html.match(/total play count\s*[:：]\s*([\d,]+)/i)
        || html.match(/累計プレー回数\s*[:：]\s*([\d,]+)/i)
        || html.match(/遊玩次數[^<]*<[^>]+>[\s\S]*?<[^>]+>([\d,]+)/i)
        || html.match(/<div[^>]*>[^<]*play[^<]*<\/div>\s*<div[^>]*>([\d,]+)/i);
    if (playCountMatch) data.playCount = playCountMatch[1].replace(/,/g, '');

    // 星星數 (star)
    const starMatch = html.match(/class="[^"]*star[^"]*"[^>]*>\s*([\d,]+)/i)
        || html.match(/icon_star\.png[^>]+>×([\d,]+)/i)
        || html.match(/×([\d,]+)<\/div>/i);
    if (starMatch) data.stars = starMatch[1].replace(/,/g, '');

    // 頭像 (avatar) - 優先擷取角色圖片 (Chara)，若無則 fallback 至圖示 (Icon)
    const avatarMatch = html.match(/<img[^>]+src="([^"]*img\/Chara\/[^"]+)"/i)
        || html.match(/<img[^>]+src="([^"]*img\/[iI]con\/[^"]+)"/i)
        || html.match(/class="w_112[^"]*"[^>]+src="([^"]+)"/i);
    if (avatarMatch) data.avatar = avatarMatch[1];

    // maimile
    const maimileMatch = html.match(/class="[^"]*mile_block[^"]*"[^>]*>\s*([\d,]+)\s*/i);
    if (maimileMatch) data.maimile = maimileMatch[1].replace(/,/g, '');

    return data;
}

/**
 * 同步資料到 Discord Connection Widget Profile
 * @param {string} userId Discord 用戶 ID
 * @param {object} playerData 玩家資料物件
 * @param {'INT'|'JP'} server 伺服器類型
 * @param {object} [client] Discord Client 實例
 */
async function syncWidget(userId, playerData, server, client) {
    let avatarUrl = null;
    let uploadWarning = null;

    const clientId = process.env.CLIENT_ID;
    const token = process.env.DISCORD_TOKEN;
    const url = `https://discord.com/api/v9/applications/${clientId}/users/${userId}/identities/0/profile`;

    // 嘗試取得現有 Profile 的圖床 URL 作為備援快取
    let existingAvatarUrl = null;
    try {
        const currentProfile = await axios.get(url, {
            headers: { 'Authorization': `Bot ${token}` },
            timeout: 5000
        });
        const currentRankImage = currentProfile.data?.data?.primary?.rank_image?.url;
        const currentDynamicAvatar = currentProfile.data?.data?.dynamic?.find(x => x.name === 'avatar')?.value?.url;
        const candidate = currentRankImage || currentDynamicAvatar;
        if (candidate && (candidate.includes('catbox.moe') || candidate.includes('ibb.co') || candidate.includes('imgur.com'))) {
            existingAvatarUrl = candidate;
        }
    } catch {
        // 忽略取得現有資料的錯誤
    }

    // 將頭像下載並上傳至公開圖床，以供 Discord Widget 公開讀取
    if (playerData.avatar) {
        try {
            const session = userSessions.getSession(userId);
            if (session && typeof session._cookieHeader === 'function') {
                console.log('[maimai-widget] 開始下載頭像...');
                const avatarBuffer = await downloadMaimaiAvatar(session, playerData.avatar, server);
                const uploadedUrl = await uploadToImageHost(avatarBuffer, userId);
                if (uploadedUrl) {
                    avatarUrl = uploadedUrl;
                } else if (existingAvatarUrl) {
                    console.log(`[maimai-widget] 圖床暫時無法上傳新圖，沿用現有有效圖床 URL: ${existingAvatarUrl}`);
                    avatarUrl = existingAvatarUrl;
                } else {
                    uploadWarning = '圖床暫時無法連線（Catbox 目前暫停上傳服務）。建議在 .env 中設定 IMGBB_API_KEY 以確保永久穩定託管頭像にゃ～';
                }
            }
        } catch (err) {
            console.error('[maimai-widget] 下載或上傳頭像時發生錯誤:', err.message);
            if (existingAvatarUrl) {
                avatarUrl = existingAvatarUrl;
            } else {
                uploadWarning = `取得頭像失敗: ${err.message}`;
            }
        }
    } else if (existingAvatarUrl) {
        avatarUrl = existingAvatarUrl;
    }

    const dynamicData = [
        { type: 1, name: 'Title', value: playerData.title || 'None' },
        { type: 1, name: 'dans', value: playerData.dans || 'Not set' },
        { type: 1, name: 'star', value: playerData.stars || '0' },
        { type: 1, name: 'class', value: playerData.classRank || 'Not set' },
        { type: 1, name: 'rating', value: playerData.rating || '0' },
        { type: 1, name: 'playcount', value: playerData.playCount || '0' },
        { type: 1, name: 'maimile', value: playerData.maimile || '0' },
        { type: 1, name: 'rating_mini', value: playerData.rating ? `Rating: ${playerData.rating}` : 'Rating: 0' }
    ];

    let mediaObject = null;
    if (avatarUrl) {
        mediaObject = { url: avatarUrl };
        // 同時提供常見的圖片變數名稱別名，確保無論 Discord Developer Portal 綁定哪一個 key 都能成功顯示
        const imageAliases = ['avatar', 'Avatar', 'icon', 'Icon', 'image', 'Image', 'chara', 'Chara', 'rank_image'];
        for (const alias of imageAliases) {
            dynamicData.push({
                type: 3,
                name: alias,
                value: mediaObject
            });
        }
    }

    const payload = {
        username: playerData.name || 'maimai DX Player',
        data: {
            primary: {
                rank_name: playerData.classRank || playerData.dans || 'Not set',
                ...(mediaObject ? { rank_image: mediaObject } : {})
            },
            dynamic: dynamicData
        }
    };

    console.log(`[maimai-widget] 同步 API 請求: ${url}`);
    
    try {
        const response = await axios.patch(url, payload, {
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json'
            }
        });

        return { data: response.data, avatarUrl, uploadWarning };
    } catch (error) {
        // ── 精準捕捉 Discord API 錯誤 ────────────────────────────
        if (error.response && error.response.data) {
            const apiCode = error.response.data.code;
            const apiMessage = error.response.data.message;

            console.error(`[maimai-widget-sync] Discord API 回傳錯誤 (Code ${apiCode}): ${apiMessage}`, JSON.stringify(error.response.data));

            if (apiCode === 40106) {
                throw new Error('此 maimai 帳號已被繫結在其他的 Discord 帳號上，無法重複繫結。若曾用舊帳號繫結過，請先解除舊帳號的連線。');
            }
            if (apiCode === 50035 && error.response.data.errors) {
                throw new Error(`Discord 拒絕了請求：Invalid Form Body (代碼: 50035)。欄位錯誤細節：${JSON.stringify(error.response.data.errors)}`);
            }
            throw new Error(`Discord 拒絕了請求：${apiMessage} (代碼: ${apiCode})`);
        }
        
        console.error(`[maimai-widget-sync] 發送請求時發生未知錯誤:`, error.message);
        throw error;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-widget')
        .setDescription('管理並同步你的 maimai DX 資料至 Discord 個人資料小工具にゃ')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const server = userSessions.getServer(userId);

        // ── 檢查並處理登入 ──────────────────────────────────────
        if (!userSessions.isLoggedIn(userId)) {
            if (userSessions.hasAutoLogin(userId)) {
                try {
                    const { int: intErr, jp: jpErr } = await userSessions.loginWithSaved(userId);
                    const loginErr = server === 'JP' ? jpErr : intErr;
                    if (loginErr) {
                        return interaction.editReply({
                            content: `❌ 自動登入失敗：${loginErr.message}\n請先使用 \`/maimai-login\` 重新登入以同步 widget にゃ～`,
                        });
                    }
                } catch (err) {
                    return interaction.editReply({
                        content: `❌ 自動登入失敗：${err.message}\n請先使用 \`/maimai-login\` 重新登入以同步 widget にゃ～`,
                    });
                }
            } else {
                return interaction.editReply({
                    content: '❌ 尚未登入にゃ！請先使用 `/maimai-login` 登入你的 SEGA 帳號にゃ～',
                });
            }
        }

        // ── 建立按鈕 ──────────────────────────────────────────
        const clientId = process.env.CLIENT_ID;
        const authorizeButton = new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('授權 Widget')
            .setURL(`https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=token&scope=openid+sdk.social_layer`);

        const syncButton = new ButtonBuilder()
            .setStyle(ButtonStyle.Primary)
            .setLabel('同步資料')
            .setCustomId(`maimai_widget_sync_${userId}`);

        const scriptButton = new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setLabel('顯示客戶端腳本')
            .setCustomId(`maimai_widget_script_${userId}`);

        const row = new ActionRowBuilder().addComponents(authorizeButton, syncButton, scriptButton);

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('⚙️ maimai DX Discord Widget 管理にゃ')
            .setDescription(
                '你可以點擊下方按鈕，將你的 maimai DX 資料同步至 Discord 個人資料連接小工具 (Profile Widget)！\n\n' +
                '**💡 設定步驟：**\n' +
                '1. 點擊 **「授權 Widget」** 按鈕開啟 Discord 授權網頁。\n' +
                '2. 同意授權後直接關閉該網頁（不需特別導向）。\n' +
                '3. 點擊 **「同步資料」** 按鈕即可完成同步にゃ！\n\n' +
                '**✨ 提示：**\n' +
                '如果你的個人檔案上尚未出現此應用的小工具，可點擊 **「顯示客戶端腳本」** 按鈕，獲取手動新增 Widget 的輔助腳本與教學にゃ～\n\n' +
                '-# 本 Bot 不會儲存您的 Token，且僅能更新此應用的 Widget 資料にゃ。'
            )
            .addFields(
                { name: '⭐ 主要伺服器', value: SERVER_LABELS[server], inline: true }
            )
            .setFooter({ text: 'Salt 隨時為您服務にゃ🐾', iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], components: [row] });
    },

    // 匯出輔助與同步方法以供事件處理程序使用
    parsePlayerData,
    syncWidget
};