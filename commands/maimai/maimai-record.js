const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ApplicationIntegrationType,
    InteractionContextType,
} = require('discord.js');
const userSessions = require('../../utils/userSessions');

// Per-user record cache: userId -> { records: Array, index: number }
const recordCache = new Map();

const SERVER_LABELS = {
    INT: '🌏 國際版 (International)',
    JP: '🇯🇵 日本版 (Japan)',
};

const SERVER_COLORS = {
    INT: 0x3498DB,
    JP: 0xE60012,
};

const DIFF_INFO = {
    basic: { name: 'BASIC', emoji: '🟢' },
    advanced: { name: 'ADVANCED', emoji: '🟡' },
    expert: { name: 'EXPERT', emoji: '🔴' },
    master: { name: 'MASTER', emoji: '🟣' },
    remaster: { name: 'Re:MASTER', emoji: '⚪' },
};

// ── HTML parsers ──────────────────────────────────────────────────────────────

function parseDifficulty(src) {
    if (!src) return null;
    const s = src.toLowerCase();
    if (s.includes('remaster') || s.includes('re_master')) return 'remaster';
    if (s.includes('master')) return 'master';
    if (s.includes('expert')) return 'expert';
    if (s.includes('advanced')) return 'advanced';
    if (s.includes('basic')) return 'basic';
    return null;
}

function parseRank(src) {
    if (!src) return null;
    const s = src.toLowerCase();

    // Primary: extract rank name directly from "scorerankicon_<name>.png" paths
    // e.g. /img/playlog/ui_scorerankicon_sssplus.png  →  name = "sssplus"
    const iconMatch = s.match(/scorerankicon_([a-z_]+?)(?:\.png|\.gif|\.jpg|$)/);
    if (iconMatch) {
        const name = iconMatch[1];
        if (name === 'sssplus' || name === 'sss_plus') return 'SSS+';
        if (name === 'sss') return 'SSS';
        if (name === 'ssplus' || name === 'ss_plus') return 'SS+';
        if (name === 'ss') return 'SS';
        if (name === 'splus' || name === 's_plus') return 'S+';
        if (name === 's') return 'S';
        if (name === 'aaa') return 'AAA';
        if (name === 'aaplus' || name === 'aa_plus') return 'AA+';
        if (name === 'aa') return 'AA';
        if (name === 'aplus' || name === 'a_plus') return 'A+';
        if (name === 'a') return 'A';
        if (name === 'bbb') return 'BBB';
        if (name === 'bb') return 'BB';
        if (name === 'b') return 'B';
        if (name === 'c') return 'C';
        if (name === 'd') return 'D';
    }

    // Fallback: substring checks on the full src string
    if (s.includes('sss_plus') || s.includes('sssplus')) return 'SSS+';
    if (s.includes('sss')) return 'SSS';
    if (s.includes('ss_plus') || s.includes('ssplus')) return 'SS+';
    if (s.includes('ss')) return 'SS';
    if (s.includes('s_plus') || s.includes('splus')) return 'S+';
    if (s.includes('/s.')) return 'S';
    if (s.includes('aaa')) return 'AAA';
    if (s.includes('aa_plus') || s.includes('aaplus')) return 'AA+';
    if (s.includes('/aa.')) return 'AA';
    if (s.includes('a_plus') || s.includes('aplus')) return 'A+';
    if (s.includes('/a.')) return 'A';
    if (s.includes('bbb')) return 'BBB';
    if (s.includes('/bb.')) return 'BB';
    if (s.includes('/b.')) return 'B';
    if (s.includes('/c.')) return 'C';
    if (s.includes('/d.')) return 'D';
    return null;
}

function parseFCStatus(src) {
    if (!src) return null;
    const s = src.toLowerCase();
    if (s.includes('applus') || s.includes('ap_plus') || s.includes('allperfectplus')) return 'AP+';
    if (s.includes('/ap.')) return 'AP';
    if (s.includes('fcplus') || s.includes('fc_plus') || s.includes('fullcomboplus')) return 'FC+';
    if (s.includes('/fc.')) return 'FC';
    return null;
}

function parseMusicType(src) {
    if (!src) return null;
    return src.toLowerCase().includes('_dx') ? 'DX' : 'STD';
}

/**
 * Strip all HTML tags from a string, looping until no tags remain so that
 * constructs like <<script>script> are fully removed.
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
 * Extract the achievement percentage from a record block's HTML.
 * The site renders it as separate spans: integer, ".", decimal, "%".
 */
function extractAchievement(block) {
    // Fast path: already assembled as "100.0000%"
    const fullMatch = block.match(/(\d{1,3}\.\d{4})\s*%/);
    if (fullMatch) return `${fullMatch[1]}%`;

    // Reconstruct from the achievement text div
    const achvBlockMatch = block.match(/class="[^"]*playlog_achievement_txt[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (achvBlockMatch) {
        const stripped = stripHtml(achvBlockMatch[1]).replace(/\s+/g, '');
        const pctMatch = stripped.match(/^(\d{1,3}\.?\d*)%?$/);
        if (pctMatch) return `${pctMatch[1]}%`;
    }
    return null;
}

/**
 * Parse a single record block's HTML into a plain object.
 * @param {string} block
 * @returns {object}
 */
function parseRecordBlock(block) {
    const record = {};

    // 1. 曲名 (Song Title)
    // 擷取 basic_block，直到下一個主要區塊 div (p_r) 開始，避免被截斷
    const basicMatch = block.match(/class="[^"]*basic_block[^"]*"[^>]*>([\s\S]*?)<div[^>]+class="[^"]*p_r/i);
    if (basicMatch) {
        let text = basicMatch[1];
        // 先移除等級數字的 div (例如包含 14+ 的區塊)，避免與曲名混淆
        text = text.replace(/<div[^>]*class="[^"]*music_lv_back[^"]*"[^>]*>.*?<\/div>/gi, '');
        // 移除剩餘 HTML 標籤
        text = stripHtml(text);
        if (text) record.title = text;
    }
    
    // 備用曲名提取
    if (!record.title) {
        const tm = block.match(/class="[^"]*music_(?:name|title)_block[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (tm) record.title = stripHtml(tm[1]);
    }

    // 2. 難度 (Difficulty)
    const diffMatch = block.match(/playlog_(remaster|master|expert|advanced|basic)_container/i)
        || block.match(/diff_([a-z]+)\.png/i);
    if (diffMatch) record.difficulty = diffMatch[1].toLowerCase();

    // 3. 達成率 (Achievement)
    const achMatch = block.match(/playlog_achievement_txt[^>]*>(\d+)<span[^>]*>\.(\d+)%<\/span>/i) 
        || block.match(/(\d{1,3}\.\d{4})%/);
    if (achMatch) {
        record.achievement = achMatch[2] ? `${achMatch[1]}.${achMatch[2]}%` : `${achMatch[1]}%`;
    }

    // 4. 等級評價 (Rank)
    // 加入對 plus 字尾檔名的支援 (例如 sssplus.png)
    const rankMatch = block.match(/img\/playlog\/(sssplus|sss|ssplus|ss|splus|s|aaa|aa|a|bbb|bb|b|c|d)\.png/i)
        || block.match(/scorerank_([a-z0-9_]+)\.png/i);
    if (rankMatch) {
        let r = rankMatch[1].toUpperCase();
        r = r.replace(/PLUS/g, '+').replace(/_PLUS/g, '+');
        record.rank = r;
    }

    // 5. FC / Sync 狀態
    const fcMatch = block.match(/img\/playlog\/(fcplus|fc|applus|ap|fcp|app)(?:_dummy)?\.png/i);
    if (fcMatch && !fcMatch[0].includes('dummy')) {
        let f = fcMatch[1].toUpperCase();
        f = f.replace(/PLUS/g, '+');
        if (f === 'FCP') f = 'FC+'; // 防呆
        if (f === 'APP') f = 'AP+'; // 防呆
        record.fc = f;
    } else {
        record.fc = null;
    }

    // 6. 譜面類型 (DX / Standard)
    const typeMatch = block.match(/music_(dx|standard)\.png/i);
    if (typeMatch) record.musicType = (typeMatch[1] === 'dx') ? 'DX' : 'STD';

    // 7. 遊玩日期
    const dateMatch = block.match(/(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2})/);
    if (dateMatch) record.date = dateMatch[1];

    // 8. DX Score
    const dxMatch = block.match(/white p_r_5 f_15 f_r">([\d,]+)\s*\/\s*[\d,]+/i);
    if (dxMatch) record.dxScore = dxMatch[1].replace(/,/g, '');

    return record;
}



/**
 * Parse all record cards from the record page HTML.
 * @param {string} html
 * @returns {Array<object>}
 */

// Individual record blocks are typically a few KB.  Any block larger than this
// threshold almost certainly wraps the entire record list in a single container
// div (observed on the INT server with ~146 KB).  Skip these so the fallback
// splitters can decompose them into per-record segments.
const MAX_SINGLE_RECORD_BLOCK_SIZE = 10000;

/**
 * Returns true when a segment of HTML contains indicators that it holds a
 * playlog/record entry — used to filter out obvious non-record segments from
 * the fallback splitters without dropping INT-server entries that don't use
 * the same class names as the JP server.
 * @param {string} html
 * @returns {boolean}
 */
function hasRecordIndicators(html) {
    return html.includes('playlog_diff')
        || html.includes('playlog_achievement')
        || /\d{2,3}\.\d{4}%/.test(html)
        || html.includes('diff_')
        || html.includes('scorerankicon');
}

/**
 * Parse all record cards from the record page HTML.
 * @param {string} html
 * @returns {Array<object>}
 */
function parseRecords(html) {
    console.log(`[maimai-record] parseRecords 開始解析，HTML 長度: ${html.length} 字元`);
    const records = [];

    // 直接使用每筆紀錄獨立的共用外層容器來切割，保證每一塊都是完整的單筆紀錄
    const parts = html.split(/(?=<div[^>]+class="[^"]*p_10 t_l f_0 v_b[^"]*"[^>]*>)/i);
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        // 確保這是一個實際的遊玩紀錄區塊（排除掉 footer 或其他無關區域）
        if (!part.includes('playlog_top_container')) continue;

        const record = parseRecordBlock(part);
        
        // 只要有解析出標題或達成率，就將其視為有效紀錄推入陣列
        if (record.title || record.achievement) {
            records.push(record);
        }
    }

    console.log(`[maimai-record] parseRecords 完成，共解析 ${records.length} 筆有效記錄`);
    return records;
}

// ── Embed / button builders ───────────────────────────────────────────────────

/**
 * Build an embed for a single record.
 */
function buildRecordEmbed(record, index, total, server, user) {
    const diffInfo = DIFF_INFO[record.difficulty] || { name: record.difficulty || '?', emoji: '⚪' };

    const embed = new EmbedBuilder()
        .setColor(SERVER_COLORS[server])
        .setTitle(`🎵 ${record.title || '未知歌曲'}`)
        .setFooter({
            text: `${SERVER_LABELS[server]} ─ 第 ${index + 1} / ${total} 筆 ─ 由 ${user.username} 請求`,
            iconURL: user.displayAvatarURL(),
        })
        .setTimestamp();

    const fields = [];

    if (record.difficulty) {
        fields.push({ name: '📊 難度', value: `${diffInfo.emoji} ${diffInfo.name}`, inline: true });
    }
    if (record.musicType) {
        fields.push({ name: '💿 類型', value: record.musicType === 'DX' ? '🌟 DX' : '📀 STD', inline: true });
    }
    if (record.achievement) {
        fields.push({ name: '📈 達成率', value: `**${record.achievement}**`, inline: true });
    }
    if (record.rank) {
        fields.push({ name: '🏆 評級', value: `**${record.rank}**`, inline: true });
    }
    if (record.fc) {
        fields.push({ name: '✨ FC 狀態', value: record.fc, inline: true });
    }
    if (record.dxScore) {
        fields.push({ name: '⭐ DX Score', value: record.dxScore, inline: true });
    }
    if (record.date) {
        fields.push({ name: '📅 遊玩時間', value: record.date, inline: false });
    }

    if (fields.length > 0) {
        embed.addFields(fields);
    } else {
        embed.setDescription('無法解析此筆記錄的詳細資料にゃ');
    }

    return embed;
}

/**
 * Build the ◀ / ▶ / 🔄 navigation button row.
 */
function buildNavButtons(index, total, userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`maimai_record_prev_${userId}`)
            .setLabel('◀ 上一筆')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(index === 0),
        new ButtonBuilder()
            .setCustomId(`maimai_record_next_${userId}`)
            .setLabel('下一筆 ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(index >= total - 1),
        new ButtonBuilder()
            .setCustomId(`maimai_record_refresh_${userId}`)
            .setLabel('🔄 重新載入')
            .setStyle(ButtonStyle.Primary),
    );
}

// ── Command definition ────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-record')
        .setDescription('查看你的 maimai DX 最近遊玩記錄にゃ')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    // Exported so the button handler in interactionCreate.js can use them
    recordCache,
    parseRecords,
    buildRecordEmbed,
    buildNavButtons,

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const server = userSessions.getServer(userId);
        console.log(`[maimai-record] 指令觸發 userId=${userId} server=${server}`);

        if (!userSessions.isLoggedIn(userId)) {
            if (userSessions.hasAutoLogin(userId)) {
                console.log(`[maimai-record] 用戶 ${userId} 尚未登入，嘗試使用已儲存帳號自動登入`);
                try {
                    const { int: intErr, jp: jpErr } = await userSessions.loginWithSaved(userId);
                    const loginErr = server === 'JP' ? jpErr : intErr;
                    if (loginErr) {
                        const embed = new EmbedBuilder()
                            .setColor(0xFF6B6B)
                            .setTitle('❌ 自動登入失敗にゃ')
                            .setDescription(`使用已儲存帳號自動登入失敗：${loginErr.message}\n請使用 \`/maimai-login\` 重新登入にゃ～`)
                            .setTimestamp();
                        return interaction.editReply({ embeds: [embed] });
                    }
                    console.log(`[maimai-record] 用戶 ${userId} 自動登入成功`);
                } catch (autoLoginErr) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF6B6B)
                        .setTitle('❌ 自動登入失敗にゃ')
                        .setDescription(`使用已儲存帳號自動登入失敗：${autoLoginErr.message}\n請使用 \`/maimai-login\` 重新登入にゃ～`)
                        .setTimestamp();
                    return interaction.editReply({ embeds: [embed] });
                }
            } else {
                console.log(`[maimai-record] 用戶 ${userId} 尚未登入，拒絕執行`);
                const embed = new EmbedBuilder()
                    .setColor(0xFF6B6B)
                    .setTitle('❌ 尚未登入にゃ')
                    .setDescription('請先使用 `/maimai-login` 登入你的 SEGA 帳號にゃ～')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }
        }

        console.log(`[maimai-record] 用戶 ${userId} 已登入，取得 Session`);
        const session = userSessions.getSession(userId);

        try {
            console.log(`[maimai-record] 正在向伺服器請求遊玩記錄... (record/)`);
            const res = await session.authenticatedGet('record/');
            console.log(`[maimai-record] HTTP 回應: statusCode=${res.statusCode} bodyLength=${res.body?.length ?? 0} 字元`);

            if (res.statusCode !== 200) {
                console.warn(`[maimai-record] 非預期狀態碼 ${res.statusCode}，停止處理`);
                const embed = new EmbedBuilder()
                    .setColor(0xFF6B6B)
                    .setTitle('❌ 無法取得遊玩記錄にゃ')
                    .setDescription(`伺服器回應了非預期的狀態碼：\`${res.statusCode}\`にゃ`)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const records = parseRecords(res.body);
            console.log(`[maimai-record] 回應 body 前 500 字元: ${res.body?.substring(0, 500).replace(/\n/g, ' ')}`);
            console.log(`[maimai-record] 解析完成，共取得 ${records.length} 筆記錄`);

            if (records.length === 0) {
                console.warn(`[maimai-record] 頁面解析結果為空，可能是版面更新或帳號無遊玩記錄`);
                const embed = new EmbedBuilder()
                    .setColor(0xF39C12)
                    .setTitle('⚠️ 找不到遊玩記錄にゃ')
                    .setDescription('找不到任何遊玩記錄，或是無法解析頁面內容にゃ')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            recordCache.set(userId, { records, index: 0 });
            console.log(`[maimai-record] 快取已寫入 userId=${userId}，共 ${records.length} 筆，顯示第 1 筆: title="${records[0].title}"`);

            const embed = buildRecordEmbed(records[0], 0, records.length, server, interaction.user);
            const row = buildNavButtons(0, records.length, userId);
            console.log(`[maimai-record] 回覆已送出`);

            return interaction.editReply({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error('[maimai-record] 取得遊玩記錄時發生錯誤:', error);

            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('❌ 發生錯誤にゃ')
                .setDescription('取得遊玩記錄時發生錯誤，請稍後再試，或重新執行 `/maimai-login` にゃ')
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
