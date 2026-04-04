const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-login')
        .setDescription('登入你的 SEGA 帳號，解鎖個人 maimai DX 資料にゃ')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        const userId = interaction.user.id;
        const server = userSessions.getServer(userId);

        // ── 已在記憶體中登入 ──────────────────────────────────────
        if (userSessions.isLoggedIn(userId)) {
            const intStatus = userSessions.getSession(userId, 'INT').getStatus();
            const jpStatus  = userSessions.getSession(userId, 'JP').getStatus();
            const primaryStatus = server === 'JP' ? jpStatus : intStatus;

            const embed = new EmbedBuilder()
                .setColor(0x00C851)
                .setTitle('✅ 你已經登入了にゃ！')
                .setDescription('Salt 發現你已經登入 maimai DX 了にゃ～')
                .addFields(
                    { name: '⭐ 主要伺服器', value: SERVER_LABELS[server], inline: true },
                    { name: '🕐 登入時間', value: `<t:${Math.floor(primaryStatus.loginTime / 1000)}:R>`, inline: true },
                    { name: '🌏 國際版', value: intStatus.loggedIn ? '✅ 已登入' : '❌ 未登入', inline: true },
                    { name: '🇯🇵 日本版', value: jpStatus.loggedIn  ? '✅ 已登入' : '❌ 未登入', inline: true },
                )
                .setFooter({ text: '使用 /maimai-logout 可以登出にゃ', iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            const components = [];
            if (userSessions.hasAutoLogin(userId)) {
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`maimai_creds_delete_${userId}`)
                        .setLabel('🗑️ 刪除已儲存的帳號密碼')
                        .setStyle(ButtonStyle.Danger),
                ));
            }

            return interaction.reply({ embeds: [embed], ephemeral: true, components });
        }

        // ── 未登入，但有已儲存的帳號密碼 → 自動登入 ─────────────
        if (userSessions.hasAutoLogin(userId)) {
            await interaction.deferReply({ ephemeral: true });

            const { int: intErr, jp: jpErr } = await userSessions.loginWithSaved(userId);
            const intOk = intErr === null;
            const jpOk  = jpErr  === null;

            if (!intOk && !jpOk) {
                console.error(`[MaimaiLogin] 用戶 ${userId} 自動登入兩個伺服器均失敗:`, intErr?.message);
                const embed = new EmbedBuilder()
                    .setColor(0xFF4444)
                    .setTitle('❌ 自動登入失敗にゃ')
                    .setDescription('Salt 無法使用已儲存的帳號密碼登入にゃ，可能是密碼已變更にゃ')
                    .addFields(
                        { name: '🌏 國際版', value: `❌ ${intErr.message || '未知錯誤'}`, inline: false },
                        { name: '🇯🇵 日本版', value: `❌ ${jpErr.message || '未知錯誤'}`, inline: false },
                    )
                    .setFooter({ text: '如果帳號密碼已更改，請刪除儲存的資料後重新登入にゃ', iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();

                return interaction.editReply({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`maimai_creds_delete_${userId}`)
                            .setLabel('🗑️ 刪除已儲存的帳號密碼')
                            .setStyle(ButtonStyle.Danger),
                    )],
                });
            }

            if (intErr) console.error(`[MaimaiLogin] 用戶 ${userId} 國際版自動登入失敗:`, intErr.message);
            if (jpErr)  console.error(`[MaimaiLogin] 用戶 ${userId} 日本版自動登入失敗:`, jpErr.message);

            const embed = new EmbedBuilder()
                .setColor(intOk && jpOk ? 0x00C851 : 0xF39C12)
                .setTitle(intOk && jpOk ? '✅ 自動登入成功！' : '⚠️ 部分伺服器自動登入成功にゃ')
                .setDescription('Salt 使用已儲存的帳號密碼幫你登入 maimai DX 了にゃ～')
                .addFields(
                    { name: '⭐ 主要伺服器', value: SERVER_LABELS[server], inline: true },
                    { name: '🕐 登入時間', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: '🌏 國際版', value: intOk ? '✅ 已登入' : `❌ ${intErr.message}`, inline: true },
                    { name: '🇯🇵 日本版', value: jpOk  ? '✅ 已登入' : `❌ ${jpErr.message}`,  inline: true },
                )
                .setFooter({ text: '使用 /maimai-logout 可以登出にゃ', iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.editReply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`maimai_creds_delete_${userId}`)
                        .setLabel('🗑️ 刪除已儲存的帳號密碼')
                        .setStyle(ButtonStyle.Danger),
                )],
            });
        }

        // ── 顯示登入 Modal ────────────────────────────────────────
        const modal = new ModalBuilder()
            .setCustomId('maimai_login_modal')
            .setTitle('登入 SEGA 帳號にゃ');

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
