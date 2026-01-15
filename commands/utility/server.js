const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('Salt 來介紹這個伺服器にゃ')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        if (!interaction.guild) {
            return await interaction.reply({
                content: '這個指令只能在伺服器裡用にゃ！',
                ephemeral: true
            });
        }

        const guild = interaction.guild;

        // 獲取伺服器統計
        const totalMembers = guild.memberCount;
        const onlineMembers = guild.members.cache.filter(member =>
            member.presence?.status === 'online').size;
        const botCount = guild.members.cache.filter(member => member.user.bot).size;
        const humanCount = totalMembers - botCount;

        const embed = new EmbedBuilder()
            .setColor(0x9932CC)
            .setTitle(`🏰 ${guild.name} 的介紹にゃ`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '伺服器 ID', value: guild.id, inline: true },
                { name: '創建時間', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false },
                { name: '擁有者', value: `<@${guild.ownerId}>`, inline: true },
                { name: '總成員數', value: `${totalMembers}`, inline: true },
                { name: '人類成員', value: `${humanCount}`, inline: true },
                { name: '機器人', value: `${botCount}`, inline: true },
                { name: '線上成員', value: `${onlineMembers}`, inline: true },
                { name: '頻道數量', value: `${guild.channels.cache.size}`, inline: true },
                { name: '身分組數量', value: `${guild.roles.cache.size}`, inline: true },
                { name: '表情符號', value: `${guild.emojis.cache.size}`, inline: true },
                { name: '加成等級', value: `${guild.premiumTier}`, inline: true },
                { name: '加成訂閱數', value: `${guild.premiumSubscriptionCount || 0}`, inline: true }
            )
            .setTimestamp();

        if (guild.description) {
            embed.setDescription(guild.description);
        }

        if (guild.bannerURL()) {
            embed.setImage(guild.bannerURL({ dynamic: true, size: 1024 }));
        }

        await interaction.reply({ embeds: [embed] });
    },
};
