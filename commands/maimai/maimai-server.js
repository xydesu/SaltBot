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

const SERVER_URLS = {
    INT: 'https://maimaidx-eng.com/',
    JP:  'https://maimaidx.jp/',
};

const SERVER_COLORS = {
    INT: 0x3498DB,
    JP:  0xE60012,
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-server')
        .setDescription('查看或設定你的 maimai DX 主要伺服器にゃ')
        .addStringOption(option =>
            option.setName('server')
                .setDescription('要切換的伺服器')
                .setRequired(false)
                .addChoices(
                    { name: '🌏 國際版 (International)', value: 'INT' },
                    { name: '🇯🇵 日本版 (Japan)', value: 'JP' },
                ))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        const newServer = interaction.options.getString('server');
        const userId = interaction.user.id;

        if (newServer) {
            const oldServer = userSessions.getServer(userId);
            userSessions.setServer(userId, newServer);

            const embed = new EmbedBuilder()
                .setColor(SERVER_COLORS[newServer])
                .setTitle('✅ 主要伺服器已更新にゃ！')
                .setDescription(`Salt 幫你把主要伺服器設定成 **${SERVER_LABELS[newServer]}** 了にゃ～`)
                .addFields(
                    { name: '🔄 之前的伺服器', value: SERVER_LABELS[oldServer], inline: true },
                    { name: '✨ 現在的伺服器', value: SERVER_LABELS[newServer], inline: true },
                    { name: '🔗 伺服器網址', value: SERVER_URLS[newServer], inline: false },
                )
                .setFooter({ text: '使用 /maimai-login 登入你的 SEGA 帳號にゃ', iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Show current server status (no option given)
        const currentServer = userSessions.getServer(userId);
        const intStatus = userSessions.getSession(userId, 'INT').getStatus();
        const jpStatus  = userSessions.getSession(userId, 'JP').getStatus();

        const formatStatus = (status) => status.loggedIn
            ? `✅ 已登入 ─ <t:${Math.floor(status.loginTime / 1000)}:R>`
            : '❌ 未登入';

        const embed = new EmbedBuilder()
            .setColor(SERVER_COLORS[currentServer])
            .setTitle('🎮 你的 maimai DX 伺服器資訊にゃ')
            .setDescription(`目前主要伺服器：**${SERVER_LABELS[currentServer]}**`)
            .addFields(
                {
                    name: `${currentServer === 'INT' ? '⭐ ' : ''}🌏 國際版`,
                    value: formatStatus(intStatus),
                    inline: true,
                },
                {
                    name: `${currentServer === 'JP' ? '⭐ ' : ''}🇯🇵 日本版`,
                    value: formatStatus(jpStatus),
                    inline: true,
                },
            )
            .setFooter({ text: '使用 /maimai-server server:... 切換伺服器，/maimai-login 登入にゃ', iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
