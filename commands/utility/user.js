const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Salt 來介紹用戶資訊にゃ')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('想瞭解誰呢にゃ？')
                .setRequired(false))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const user = interaction.options.getUser('target') || interaction.user;
        const member = interaction.guild?.members.cache.get(user.id);

        const embed = new EmbedBuilder()
            .setColor(0xFF9900)
            .setTitle(`👤 ${user.username} 的詳細資料にゃ`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '用戶名', value: user.tag, inline: true },
                { name: '用戶 ID', value: user.id, inline: true },
                { name: '帳號建立時間', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false }
            );

        if (member) {
            embed.addFields(
                { name: '加入伺服器時間', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false },
                { name: '伺服器暱稱', value: member.displayName, inline: true },
                { name: '身分組數量', value: `${member.roles.cache.size - 1}`, inline: true }
            );

            if (member.premiumSince) {
                embed.addFields({
                    name: 'Nitro 加成開始時間',
                    value: `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:F>`,
                    inline: false
                });
            }
        }

        await interaction.reply({ embeds: [embed] });
    },
};
