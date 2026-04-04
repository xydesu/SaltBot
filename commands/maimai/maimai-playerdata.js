const {
    SlashCommandBuilder,
    EmbedBuilder,
    ApplicationIntegrationType,
    InteractionContextType,
} = require('discord.js');
const userSessions = require('../../utils/userSessions');

const SERVER_LABELS = {
    INT: '🌏 國際版 (International)',
    JP:  '🇯🇵 日本版 (Japan)',
};

const SERVER_COLORS = {
    INT: 0x3498DB,
    JP:  0xE60012,
};

/**
 * 從 playerData 頁面 HTML 中擷取玩家資料
 * @param {string} html
 * @returns {object}
 */
function parsePlayerData(html) {
    const data = {};

    // 玩家名稱
    const nameMatch = html.match(/<div\s+class="name_block[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
    if (nameMatch) data.name = nameMatch[1].replace(/<[^>]+>/g, '').trim();

    // 稱號（title）
    const titleMatch = html.match(/<div\s+class="[^"]*trophy_block[^"]*"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)
        || html.match(/<div\s+class="[^"]*title_block[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
    if (titleMatch) data.title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

    // Rating（方框數字）
    const ratingMatch = html.match(/<div\s+class="[^"]*rating_block[^"]*"[^>]*>\s*([\d,]+)\s*<\/div>/i)
        || html.match(/class="[^"]*rating[^"]*"[^>]*>\s*([\d,]+)/i);
    if (ratingMatch) data.rating = ratingMatch[1].replace(/,/g, '');

    // 段位 / 稱號圖片 alt 文字（例如 "初段"）
    const classMatch = html.match(/<img[^>]+class="[^"]*classrank[^"]*"[^>]+alt="([^"]+)"/i)
        || html.match(/img[^>]+alt="([^"]*段[^"]*|[^"]*初[^"]*|[^"]*中[^"]*|[^"]*皆傳[^"]*)"/i);
    if (classMatch) data.classRank = classMatch[1].trim();

    // 遊玩次數
    const playCountMatch = html.match(/遊玩次數[^<]*<[^>]+>[\s\S]*?<[^>]+>([\d,]+)/i)
        || html.match(/<div[^>]*>[^<]*play[^<]*<\/div>\s*<div[^>]*>([\d,]+)/i);
    if (playCountMatch) data.playCount = playCountMatch[1].replace(/,/g, '');

    // 好友碼
    const friendCodeMatch = html.match(/(\d{12})/);
    if (friendCodeMatch) data.friendCode = friendCodeMatch[1];

    // 星星數（collecte stars）
    const starMatch = html.match(/class="[^"]*star[^"]*"[^>]*>\s*([\d,]+)/i);
    if (starMatch) data.stars = starMatch[1].replace(/,/g, '');

    return data;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-playerdata')
        .setDescription('查看你的 maimai DX 玩家資料にゃ')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const server = userSessions.getServer(userId);
        console.log(`[maimai-playerdata] 指令觸發 userId=${userId} server=${server}`);

        if (!userSessions.isLoggedIn(userId)) {
            console.log(`[maimai-playerdata] 用戶 ${userId} 尚未登入，拒絕執行`);
            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('❌ 尚未登入にゃ')
                .setDescription('請先使用 `/maimai-login` 登入你的 SEGA 帳號にゃ～')
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        console.log(`[maimai-playerdata] 用戶 ${userId} 已登入，取得 Session`);
        const session = userSessions.getSession(userId);

        try {
            console.log(`[maimai-playerdata] 正在向伺服器請求玩家資料... (playerData/)`);
            const res = await session.authenticatedGet('playerData/');
            console.log(`[maimai-playerdata] HTTP 回應: statusCode=${res.statusCode} bodyLength=${res.body?.length ?? 0} 字元`);

            if (res.statusCode !== 200) {
                console.warn(`[maimai-playerdata] 非預期狀態碼 ${res.statusCode}，停止處理`);
                const embed = new EmbedBuilder()
                    .setColor(0xFF6B6B)
                    .setTitle('❌ 無法取得玩家資料にゃ')
                    .setDescription(`伺服器回應了非預期的狀態碼：\`${res.statusCode}\`にゃ`)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const playerData = parsePlayerData(res.body);
            const parsedFields = Object.keys(playerData).filter(k => playerData[k] != null);
            console.log(`[maimai-playerdata] 解析完成，取得欄位: [${parsedFields.join(', ')}]`);
            console.log(`[maimai-playerdata] 解析結果: name="${playerData.name}" rating="${playerData.rating}" classRank="${playerData.classRank}" playCount="${playerData.playCount}" stars="${playerData.stars}" friendCode="${playerData.friendCode}" title="${playerData.title}"`);

            const embed = new EmbedBuilder()
                .setColor(SERVER_COLORS[server])
                .setTitle('🎮 maimai DX 玩家資料にゃ')
                .setFooter({
                    text: `${SERVER_LABELS[server]} ─ 由 ${interaction.user.username} 請求`,
                    iconURL: interaction.user.displayAvatarURL(),
                })
                .setTimestamp();

            if (playerData.name) {
                embed.setDescription(`**${playerData.name}** の資料にゃ～`);
            } else {
                embed.setDescription('找到玩家資料了にゃ～');
            }

            const fields = [];

            if (playerData.title) {
                fields.push({ name: '🏷️ 稱號', value: playerData.title, inline: true });
            }
            if (playerData.rating) {
                fields.push({ name: '⭐ Rating', value: `**${playerData.rating}**`, inline: true });
            }
            if (playerData.classRank) {
                fields.push({ name: '🎖️ 段位', value: playerData.classRank, inline: true });
            }
            if (playerData.playCount) {
                fields.push({ name: '🎵 遊玩次數', value: `${playerData.playCount} 次`, inline: true });
            }
            if (playerData.stars) {
                fields.push({ name: '⭐ 星星數', value: playerData.stars, inline: true });
            }
            if (playerData.friendCode) {
                fields.push({ name: '🔢 好友碼', value: `\`${playerData.friendCode}\``, inline: true });
            }

            if (fields.length > 0) {
                console.log(`[maimai-playerdata] 嵌入訊息包含 ${fields.length} 個欄位`);
                embed.addFields(fields);
            } else {
                console.warn(`[maimai-playerdata] 無法解析任何玩家資料欄位，可能是頁面版面已更新`);
                embed.addFields({
                    name: '⚠️ 無法解析詳細資料',
                    value: '成功取得頁面，但無法解析玩家資訊，可能是網站版面有更新にゃ',
                    inline: false,
                });
            }

            console.log(`[maimai-playerdata] 回覆已送出`);
            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[maimai-playerdata] 取得玩家資料時發生錯誤:', error);

            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('❌ 發生錯誤にゃ')
                .setDescription('取得玩家資料時發生錯誤，請稍後再試，或重新執行 `/maimai-login` にゃ')
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
