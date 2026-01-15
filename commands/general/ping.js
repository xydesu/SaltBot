const { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('檢查 Salt 的反應速度にゃ')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const sent = await interaction.reply({
            content: 'にゃんぽん！🐾',
            fetchReply: true
        });

        const ping = sent.createdTimestamp - interaction.createdTimestamp;

        await interaction.editReply(`にゃんぽん！🐾\n我的反應速度: ${ping}ms にゃ\nDiscord API 速度: ${Math.round(interaction.client.ws.ping)}ms にゃ`);
    },
};
