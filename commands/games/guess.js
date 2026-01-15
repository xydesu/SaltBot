const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

const activeGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guess')
        .setDescription('Salt 的猜數字遊戲にゃ！猜一個1到100之間的數字にゃ')
        .addIntegerOption(option =>
            option.setName('range')
                .setDescription('設定數字範圍にゃ (預設1-100)')
                .setMinValue(10)
                .setMaxValue(1000)
                .setRequired(false))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const range = interaction.options.getInteger('range') || 100;
        const targetNumber = Math.floor(Math.random() * range) + 1;
        const gameId = `${interaction.user.id}-${Date.now()}`;

        // 儲存遊戲狀態
        activeGames.set(gameId, {
            targetNumber,
            range,
            attempts: 0,
            maxAttempts: Math.ceil(Math.log2(range)) + 3, // 根據範圍計算最大嘗試次數
            userId: interaction.user.id,
            startTime: Date.now()
        });

        const embed = new EmbedBuilder()
            .setColor(0x00FF7F)
            .setTitle('🎯 Salt 的猜數字遊戲開始にゃ！')
            .setDescription(`我已經想好了一個 **1** 到 **${range}** 之間的數字にゃ！\n你有 **${activeGames.get(gameId).maxAttempts}** 次機會猜中它にゃ～`)
            .addFields(
                { name: '🎮 怎麼玩呢にゃ', value: '用 `/guessnum` 指令輸入你的猜測にゃ', inline: true },
                { name: '🎲 遊戲 ID', value: `\`${gameId}\``, inline: true },
                { name: '⏰ 時間限制', value: '5 分鐘にゃ', inline: true }
            )
            .setFooter({ text: '加油にゃ！🐾', iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // 5分鐘後自動清理遊戲
        setTimeout(() => {
            if (activeGames.has(gameId)) {
                activeGames.delete(gameId);
            }
        }, 300000);
    },

    // 輔助函數供其他指令使用
    getActiveGames: () => activeGames,
};
