const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('看看美美的頭像にゃ')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('想看誰的頭像呢にゃ？')
                .setRequired(false))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild?.members.cache.get(user.id);

        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle(`🖼️ ${user.username} 的美美頭像にゃ`)
            .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }))
            .setTimestamp()
            .setFooter({
                text: `${interaction.user.username} 想看頭像にゃ`,
                iconURL: interaction.user.displayAvatarURL()
            });

        // 添加頭像連結按鈕
        const avatarLinks = [];

        // 全域頭像連結
        const globalAvatar = user.displayAvatarURL({ dynamic: true, size: 1024 });
        avatarLinks.push(`[1024px](${globalAvatar})`);
        avatarLinks.push(`[512px](${user.displayAvatarURL({ dynamic: true, size: 512 })})`);
        avatarLinks.push(`[256px](${user.displayAvatarURL({ dynamic: true, size: 256 })})`);
        avatarLinks.push(`[128px](${user.displayAvatarURL({ dynamic: true, size: 128 })})`);

        embed.addFields({
            name: '📥 下載連結',
            value: avatarLinks.join(' • '),
            inline: false
        });

        // 如果用戶在伺服器中且有伺服器特定頭像
        if (member && member.avatarURL()) {
            embed.addFields({
                name: '🏰 伺服器頭像',
                value: '此用戶在這個伺服器有自定義頭像',
                inline: false
            });

            const serverAvatarLinks = [];
            serverAvatarLinks.push(`[1024px](${member.avatarURL({ dynamic: true, size: 1024 })})`);
            serverAvatarLinks.push(`[512px](${member.avatarURL({ dynamic: true, size: 512 })})`);
            serverAvatarLinks.push(`[256px](${member.avatarURL({ dynamic: true, size: 256 })})`);
            serverAvatarLinks.push(`[128px](${member.avatarURL({ dynamic: true, size: 128 })})`);

            embed.addFields({
                name: '📥 伺服器頭像下載',
                value: serverAvatarLinks.join(' • '),
                inline: false
            });

            // 顯示伺服器頭像作為縮圖
            embed.setThumbnail(member.avatarURL({ dynamic: true, size: 256 }));
        }

        // 添加用戶資訊
        embed.addFields(
            { name: '👤 用戶標籤', value: user.tag, inline: true },
            { name: '🆔 用戶 ID', value: user.id, inline: true },
            { name: '🤖 是否為機器人', value: user.bot ? '是' : '否', inline: true }
        );

        await interaction.reply({ embeds: [embed] });
    },
};
