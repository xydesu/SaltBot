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
    JP:  '🇯🇵 日本版 (Japan)',
};

const SERVER_COLORS = {
    INT: 0x3498DB,
    JP:  0xE60012,
};

const DIFF_INFO = {
    basic:    { name: 'BASIC',     emoji: '🟢' },
    advanced: { name: 'ADVANCED',  emoji: '🟡' },
    expert:   { name: 'EXPERT',    emoji: '🔴' },
    master:   { name: 'MASTER',    emoji: '🟣' },
    remaster: { name: 'Re:MASTER', emoji: '⚪' },
};

// ── HTML parsers ──────────────────────────────────────────────────────────────

function parseDifficulty(src) {
    if (!src) return null;
    const s = src.toLowerCase();
    if (s.includes('remaster') || s.includes('re_master')) return 'remaster';
    if (s.includes('master'))   return 'master';
    if (s.includes('expert'))   return 'expert';
    if (s.includes('advanced')) return 'advanced';
    if (s.includes('basic'))    return 'basic';
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
        if (name === 'sssplus'  || name === 'sss_plus')  return 'SSS+';
        if (name === 'sss')                              return 'SSS';
        if (name === 'ssplus'   || name === 'ss_plus')   return 'SS+';
        if (name === 'ss')                               return 'SS';
        if (name === 'splus'    || name === 's_plus')    return 'S+';
        if (name === 's')                                return 'S';
        if (name === 'aaa')                              return 'AAA';
        if (name === 'aaplus'   || name === 'aa_plus')   return 'AA+';
        if (name === 'aa')                               return 'AA';
        if (name === 'aplus'    || name === 'a_plus')    return 'A+';
        if (name === 'a')                                return 'A';
        if (name === 'bbb')                              return 'BBB';
        if (name === 'bb')                               return 'BB';
        if (name === 'b')                                return 'B';
        if (name === 'c')                                return 'C';
        if (name === 'd')                                return 'D';
    }

    // Fallback: substring checks on the full src string
    if (s.includes('sss_plus') || s.includes('sssplus')) return 'SSS+';
    if (s.includes('sss'))                               return 'SSS';
    if (s.includes('ss_plus')  || s.includes('ssplus'))  return 'SS+';
    if (s.includes('ss'))                                return 'SS';
    if (s.includes('s_plus')   || s.includes('splus'))   return 'S+';
    if (s.includes('/s.'))                               return 'S';
    if (s.includes('aaa'))                               return 'AAA';
    if (s.includes('aa_plus')  || s.includes('aaplus'))  return 'AA+';
    if (s.includes('/aa.'))                              return 'AA';
    if (s.includes('a_plus')   || s.includes('aplus'))   return 'A+';
    if (s.includes('/a.'))                               return 'A';
    if (s.includes('bbb'))                               return 'BBB';
    if (s.includes('/bb.'))                              return 'BB';
    if (s.includes('/b.'))                               return 'B';
    if (s.includes('/c.'))                               return 'C';
    if (s.includes('/d.'))                               return 'D';
    return null;
}

function parseFCStatus(src) {
    if (!src) return null;
    const s = src.toLowerCase();
    if (s.includes('applus') || s.includes('ap_plus') || s.includes('allperfectplus')) return 'AP+';
    if (s.includes('/ap.'))                                                              return 'AP';
    if (s.includes('fcplus') || s.includes('fc_plus') || s.includes('fullcomboplus'))  return 'FC+';
    if (s.includes('/fc.'))                                                              return 'FC';
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

    // Song title — try several class-name variants used across server versions
    const titleMatch = block.match(/class="[^"]*music_name_block[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || block.match(/class="[^"]*music_name[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || block.match(/class="[^"]*music_title[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || block.match(/class="[^"]*basic_block[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (titleMatch) {
        const raw = stripHtml(titleMatch[1]);
        // Reject values that look like percentages, dates, scores, or single digits
        if (raw && !/^[\d,]+$/.test(raw) && !/%/.test(raw) && !/^\d{4}[\/\-]/.test(raw)) {
            record.title = raw;
        }
    }

    // Difficulty
    const diffMatch = block.match(/<img[^>]+class="[^"]*playlog_diff[^"]*"[^>]+src="([^"]+)"/i)
        || block.match(/<img[^>]+src="([^"]*diff_[^"]*)"[^>]*/i);
    if (diffMatch) record.difficulty = parseDifficulty(diffMatch[1]);

    // Achievement rate
    record.achievement = extractAchievement(block);

    // Rank badge — handle both attribute orderings and the ui_scorerankicon_ path convention
    const rankMatch =
        // class before src
        block.match(/<img[^>]+class="[^"]*playlog_scorerank[^"]*"[^>]+src="([^"]+)"/i)
        // src before class
        || block.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*playlog_scorerank[^"]*"/i)
        // src contains "scorerank" (covers scorerank_xxx.png variants)
        || block.match(/<img[^>]+src="([^"]*scorerank[^"]*)"[^>]*/i)
        // src contains "scorerankicon" (covers ui_scorerankicon_xxx.png)
        || block.match(/<img[^>]+src="([^"]*scorerankicon[^"]*)"[^>]*/i)
        // generic /playlog/ image that matches any rank token in its filename
        || block.match(/<img[^>]+src="([^"]*\/playlog\/[^"]*(?:sss|ss|aaa|aa|bbb|bb)[^"]*\.png)"[^>]*/i);
    if (rankMatch) record.rank = parseRank(rankMatch[1]);

    // FC / AP status
    const fcMatch = block.match(/<img[^>]+class="[^"]*playlog_fc[^"]*"[^>]+src="([^"]+)"/i)
        || block.match(/<img[^>]+src="([^"]*\/fc[^"]*\.png)"[^>]*/i);
    if (fcMatch) record.fc = parseFCStatus(fcMatch[1]);

    // Music type (DX / Standard)
    const kindMatch = block.match(/<img[^>]+class="[^"]*music_kind_icon[^"]*"[^>]+src="([^"]+)"/i)
        || block.match(/<img[^>]+src="([^"]*music_(?:dx|standard)[^"]*)"[^>]*/i);
    if (kindMatch) record.musicType = parseMusicType(kindMatch[1]);

    // Play date
    const dateMatch = block.match(/class="[^"]*sub_title[^"]*"[^>]*>\s*([\d\/\-: ]+)\s*<\/div>/i)
        || block.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2}\s+\d{2}:\d{2})/);
    if (dateMatch) record.date = dateMatch[1].trim();

    // DX Score
    const dxScoreMatch = block.match(/class="[^"]*playlog_score_block[^"]*"[^>]*>\s*([\d,]+)\s*<\/div>/i)
        || block.match(/class="[^"]*score_block[^"]*"[^>]*>[\s\S]*?([\d,]+)\s*<\/div>/i);
    if (dxScoreMatch) record.dxScore = dxScoreMatch[1].replace(/,/g, '');

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

function parseRecords(html) {
    console.log(`[maimai-record] parseRecords 開始解析，HTML 長度: ${html.length} 字元`);
    const records = [];

    // Primary: split on common record-entry wrapper divs (main_wrapper, w_450, p_r)
    const blockRe = /<div[^>]+class="[^"]*(?:main_wrapper|w_450)[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*(?:main_wrapper|w_450)[^"]*"|<\/body>|$)/gi;
    let match;
    let blockCount = 0;
    while ((match = blockRe.exec(html)) !== null) {
        const block = match[1];
        if (!block.includes('music_name_block') && !block.includes('music_name') && !block.includes('basic_block') && !block.includes('playlog_diff')) continue;
        blockCount++;
        console.log(`[maimai-record] 找到記錄區塊 #${blockCount}（長度: ${block.length} 字元）`);
        const record = parseRecordBlock(block);
        console.log(`[maimai-record] 區塊 #${blockCount} 解析結果: title="${record.title}" diff="${record.difficulty}" achievement="${record.achievement}" rank="${record.rank}" fc="${record.fc}" type="${record.musicType}" date="${record.date}" dxScore="${record.dxScore}"`);
        // A very large block likely contains multiple records in a single wrapper;
        // treat it as a container (don't count it) so the fallbacks can sub-split it.
        if (record.title && block.length < MAX_SINGLE_RECORD_BLOCK_SIZE) records.push(record);
    }

    // Fallback A: split on known title-class divs — works when the title div precedes music_kind_icon
    if (records.length === 0) {
        console.log('[maimai-record] 主要解析未找到記錄，嘗試 music_name_block 備援方法');
        const parts = html.split(/(?=<div[^>]+class="[^"]*(?:music_name_block|basic_block)[^"]*")/i);
        console.log(`[maimai-record] music_name_block 備援方法找到 ${parts.length - 1} 個區段`);
        if (parts.length > 1) {
            console.log(`[maimai-record] 備援 A 區段 #1 前800字元:\n${parts[1].substring(0, 800)}`);
        }
        for (let i = 0; i < parts.slice(1).length; i++) {
            const part = parts[i + 1];
            if (!hasRecordIndicators(part)) continue;
            const record = parseRecordBlock(part);
            console.log(`[maimai-record] 備援 A 區段 #${i + 1} 解析結果: title="${record.title}" diff="${record.difficulty}" achievement="${record.achievement}" rank="${record.rank}"`);
            if (record.title || record.achievement || record.rank) records.push(record);
        }
    }

    // Fallback B: split on music_kind_icon
    // On the INT server the kind-icon img comes BEFORE the rest of the record data,
    // so each segment may not contain the song title (which lives at the end of the
    // PREVIOUS segment).  We therefore also look back when the title is missing.
    if (records.length === 0) {
        console.log('[maimai-record] 備援 A 無效，使用 music_kind_icon 備援方法');
        const parts = html.split(/(?=<img[^>]+class="[^"]*music_kind_icon)/i);
        console.log(`[maimai-record] music_kind_icon 備援方法找到 ${parts.length - 1} 個區段`);
        if (parts.length > 1) {
            console.log(`[maimai-record] 備援 B 區段 #1 前2000字元:\n${parts[1].substring(0, 2000)}`);
            console.log(`[maimai-record] 備援 B parts[0] 末500字元:\n${parts[0].slice(-500)}`);
        }
        for (let i = 0; i < parts.slice(1).length; i++) {
            const part = parts[i + 1];
            const record = parseRecordBlock(part);

            // When the title is before the kind-icon (INT server layout), it sits at
            // the tail of the previous segment — scan it with the same title regexes.
            if (!record.title && i >= 0) {
                const prevPart = parts[i];
                const titleRe = /class="[^"]*(?:music_name_block|music_name|music_title|basic_block)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
                let lastTitleMatch = null;
                let m;
                while ((m = titleRe.exec(prevPart)) !== null) { lastTitleMatch = m; }
                if (lastTitleMatch) {
                    const raw = stripHtml(lastTitleMatch[1]);
                    if (raw && !/^[\d,]+$/.test(raw) && !/%/.test(raw) && !/^\d{4}[\/\-]/.test(raw)) {
                        record.title = raw;
                    }
                }
            }

            console.log(`[maimai-record] 備援 B 區段 #${i + 1} 解析結果: title="${record.title}" diff="${record.difficulty}" achievement="${record.achievement}" rank="${record.rank}"`);
            // Push records that have any substantive data even when the title is unknown
            if (record.title || record.achievement || record.rank) records.push(record);
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
            console.log(`[maimai-record] 用戶 ${userId} 尚未登入，拒絕執行`);
            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('❌ 尚未登入にゃ')
                .setDescription('請先使用 `/maimai-login` 登入你的 SEGA 帳號にゃ～')
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
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
            const row   = buildNavButtons(0, records.length, userId);
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
