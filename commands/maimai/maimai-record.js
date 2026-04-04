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
        const stripped = achvBlockMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, '');
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

    // Song title
    const titleMatch = block.match(/class="[^"]*music_name_block[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (titleMatch) record.title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

    // Difficulty
    const diffMatch = block.match(/<img[^>]+class="[^"]*playlog_diff[^"]*"[^>]+src="([^"]+)"/i)
        || block.match(/<img[^>]+src="([^"]*diff_[^"]*)"[^>]*/i);
    if (diffMatch) record.difficulty = parseDifficulty(diffMatch[1]);

    // Achievement rate
    record.achievement = extractAchievement(block);

    // Rank badge
    const rankMatch = block.match(/<img[^>]+class="[^"]*playlog_scorerank[^"]*"[^>]+src="([^"]+)"/i)
        || block.match(/<img[^>]+src="([^"]*scorerank[^"]*)"[^>]*/i)
        || block.match(/<img[^>]+src="([^"]*\/playlog\/[a-z_]+\.png)"[^>]*class="[^"]*scorerank[^"]*"/i);
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
function parseRecords(html) {
    const records = [];

    // Primary: split on "main_wrapper" divs, each wraps one record entry
    const blockRe = /<div[^>]+class="[^"]*main_wrapper[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*main_wrapper|<\/body>|$)/gi;
    let match;
    while ((match = blockRe.exec(html)) !== null) {
        const block = match[1];
        if (!block.includes('music_name_block')) continue;
        const record = parseRecordBlock(block);
        if (record.title) records.push(record);
    }

    // Fallback: split on the music_kind_icon img tag which starts each entry
    if (records.length === 0) {
        const parts = html.split(/(?=<img[^>]+class="[^"]*music_kind_icon)/i);
        for (const part of parts.slice(1)) {
            const record = parseRecordBlock(part);
            if (record.title) records.push(record);
        }
    }

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

        if (!userSessions.isLoggedIn(userId)) {
            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('❌ 尚未登入にゃ')
                .setDescription('請先使用 `/maimai-login` 登入你的 SEGA 帳號にゃ～')
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        const server = userSessions.getServer(userId);
        const session = userSessions.getSession(userId);

        try {
            const res = await session.authenticatedGet('record/');

            if (res.statusCode !== 200) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF6B6B)
                    .setTitle('❌ 無法取得遊玩記錄にゃ')
                    .setDescription(`伺服器回應了非預期的狀態碼：\`${res.statusCode}\`にゃ`)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const records = parseRecords(res.body);

            if (records.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xF39C12)
                    .setTitle('⚠️ 找不到遊玩記錄にゃ')
                    .setDescription('找不到任何遊玩記錄，或是無法解析頁面內容にゃ')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            recordCache.set(userId, { records, index: 0 });

            const embed = buildRecordEmbed(records[0], 0, records.length, server, interaction.user);
            const row   = buildNavButtons(0, records.length, userId);

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
