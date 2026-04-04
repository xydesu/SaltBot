const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ApplicationIntegrationType,
    InteractionContextType,
} = require('discord.js');
const userSessions = require('../../utils/userSessions');

const SERVER_LABELS = {
    INT: '🌏 國際版 (International)',
    JP:  '🇯🇵 日本版 (Japan)',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-login')
        .setDescription('登入你的 SEGA 帳號，解鎖個人 maimai DX 資料にゃ')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        const userId = interaction.user.id;
        const server = userSessions.getServer(userId);

        // 若已登入，直接告知狀態
        if (userSessions.isLoggedIn(userId)) {
            const status = userSessions.getSession(userId).getStatus();
            const embed = new EmbedBuilder()
                .setColor(0x00C851)
                .setTitle('✅ 你已經登入了にゃ！')
                .setDescription('Salt 發現你已經登入 maimai DX 了にゃ～')
                .addFields(
                    { name: '🌐 伺服器', value: SERVER_LABELS[server], inline: true },
                    { name: '🕐 登入時間', value: `<t:${Math.floor(status.loginTime / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: '使用 /maimai-logout 可以登出にゃ', iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // 顯示登入 Modal
        const modal = new ModalBuilder()
            .setCustomId('maimai_login_modal')
            .setTitle(`登入 SEGA 帳號 (${server === 'JP' ? '日本版' : '國際版'})にゃ`);

        const segaIdInput = new TextInputBuilder()
            .setCustomId('sega_id')
            .setLabel('SEGA ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('請輸入你的 SEGA ID')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(64);

        const passwordInput = new TextInputBuilder()
            .setCustomId('sega_password')
            .setLabel('密碼')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('請輸入你的 SEGA 帳號密碼')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(128);

        modal.addComponents(
            new ActionRowBuilder().addComponents(segaIdInput),
            new ActionRowBuilder().addComponents(passwordInput),
        );

        await interaction.showModal(modal);
    },
};
